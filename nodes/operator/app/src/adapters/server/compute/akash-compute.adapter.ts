// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@adapters/server/compute/akash-compute.adapter`
 * Purpose: Akash Console API client implementing ComputeResourcePort — balance read over the
 *   managed (USD-billed) Console wallet PLUS the write half: provision a container workload
 *   (create deployment → await bids → lease cheapest provider), status, release (task.5044).
 * Scope: HTTPS calls to console-api.akash.network with x-api-key auth. Does NOT hold a Cosmos
 *   key, sign transactions, or settle on-chain — the Console managed wallet bills the shared
 *   operator account in USD (v0 billing model; vNext = per-spawner pass-through + crypto funding).
 * Invariants:
 *   - PROVIDER_AGNOSTIC: SDL, dseq, bids, uakt/uusdc escrow never escape; callers see only
 *     ComputeBalance / ProvisionSpec / ProvisionOutput. `leaseId` IS the dseq but is opaque
 *     to callers by contract.
 *   - ADAPTER_SWAPPABLE: implements the provider-blind ComputeResourcePort next to
 *     CherryComputeAdapter; the factory composes them.
 *   - FAIL_LOUD: HTTP / network / timeout / no-bids failures throw AkashComputeError with a
 *     stable code so callers and the awareness surface observe their own failures.
 * Side-effects: IO (HTTPS requests to the Akash Console API; provision() spends real escrow)
 * Links: ComputeResourcePort (@cogni/ai-tools/capabilities/compute), ./akash-sdl,
 *   https://akash.network/docs/api-documentation/console-api/ (endpoints verified against
 *   github.com/akash-network/console apps/api routes), task.5044
 * @internal
 */

import type {
  ComputeBalance,
  ComputeResourcePort,
  ProvisionOutput,
  ProvisionSpec,
  ProvisionState,
} from "@cogni/ai-tools";

import { type AkashSdlOptions, buildAkashSdl } from "./akash-sdl";

const PROVIDER = "akash";
const MICRO = 1_000_000;

export interface AkashComputeAdapterConfig {
  /** Akash Console API key (Settings → API Keys), sent as `x-api-key`. */
  apiKey: string;
  /** Per-request timeout for reads, in milliseconds. */
  timeoutMs: number;
  /**
   * Timeout for write calls (`/v1/deployments`, `/v1/leases` — on-chain txs that routinely
   * exceed a read budget; an aborted create can orphan a server-side deployment). Default 30s.
   */
  writeTimeoutMs?: number;
  /** USD escrow deposited per deployment (Console minimum 0.5). */
  deployDepositUsd?: number;
  /** How long to wait for provider bids before failing, in ms. */
  bidTimeoutMs?: number;
  /** Bid poll interval in ms. */
  bidPollIntervalMs?: number;
  /**
   * Provider addresses to prefer when leasing (e.g. providers whose egress IPs the shared
   * substrate's firewall allowlists). Preferred providers win over cheaper strangers; when
   * none of them bid, the cheapest open bid is leased.
   */
  preferredProviders?: readonly string[];
  /** SDL pricing knobs (max price per block per service). */
  pricing?: AkashSdlOptions;
  /** API base URL; defaults to the public Console API. */
  baseUrl?: string;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable sleep for tests; defaults to setTimeout. */
  sleepImpl?: (ms: number) => Promise<void>;
}

/** Console `GET /v1/user/me` (only the field we read). */
interface ConsoleUser {
  id?: string;
}

/** Console `GET /v1/wallets` entry (only the fields we map). */
interface ConsoleWallet {
  id?: number | string;
  address?: string;
  /** Deployment allowance in chain micro-units (uusdc for managed wallets). */
  creditAmount?: number;
  denom?: string;
  isTrialing?: boolean;
}

/** Composite on-chain bid identity — echoed verbatim into the lease call. */
interface ConsoleBidId {
  dseq?: string | number;
  gseq?: number;
  oseq?: number;
  provider?: string;
}

interface ConsoleBid {
  bid?: {
    id?: ConsoleBidId;
    state?: string;
    price?: { denom?: string; amount?: string | number };
  };
}

interface ConsoleLease {
  id?: ConsoleBidId;
  state?: string;
  status?: {
    uris?: string[];
    services?: Record<string, { uris?: string[] }>;
  } | null;
}

interface ConsoleDeploymentDetail {
  deployment?: { state?: string };
  leases?: ConsoleLease[];
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Akash Console compute adapter — read + write halves of ComputeResourcePort over the
 * managed-wallet Console API. One shared account funds every workload (v0 billing).
 */
export class AkashComputeAdapter implements ComputeResourcePort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly writeTimeoutMs: number;
  private readonly deployDepositUsd: number;
  private readonly bidTimeoutMs: number;
  private readonly bidPollIntervalMs: number;
  private readonly pricing: AkashSdlOptions;

  constructor(private readonly config: AkashComputeAdapterConfig) {
    this.baseUrl = (
      config.baseUrl ?? "https://console-api.akash.network"
    ).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleep = config.sleepImpl ?? defaultSleep;
    this.writeTimeoutMs = config.writeTimeoutMs ?? 30_000;
    // Default to the Console MINIMUM: idle escrow stays small and trial/thin wallets can
    // deploy (a $5 default 402'd on prod against the $0.50 trial — task.5044). Escrow is a
    // refundable float, not the spend cap; top-ups/auto-reload govern lease lifetime.
    this.deployDepositUsd = config.deployDepositUsd ?? 0.5;
    this.bidTimeoutMs = config.bidTimeoutMs ?? 90_000;
    this.bidPollIntervalMs = config.bidPollIntervalMs ?? 3_000;
    // uakt ceiling per block per service; managed wallets escrow USD but bid in chain denom.
    this.pricing = config.pricing ?? {
      pricingDenom: "uakt",
      pricingAmount: 10_000,
    };
  }

  async balances(): Promise<readonly ComputeBalance[]> {
    const me = await this.request<ConsoleUser>("GET", "/v1/user/me");
    const userId = me?.id;
    if (!userId) {
      throw new AkashComputeError(
        "UNEXPECTED_SHAPE",
        "Console /v1/user/me returned no user id"
      );
    }
    const wallets = await this.request<ConsoleWallet[]>(
      "GET",
      `/v1/wallets?userId=${encodeURIComponent(userId)}`
    );
    const asOf = new Date().toISOString();
    return (wallets ?? []).map((wallet) => ({
      provider: PROVIDER,
      accountId: String(wallet.address ?? wallet.id ?? "unknown"),
      // Managed wallets denominate the allowance in USD micro-units (`uact`/`uusdc`); a
      // self-custody `uakt` allowance is AKT. Any other denom is surfaced verbatim rather
      // than silently mislabeled as USD.
      currency: currencyForDenom(wallet.denom),
      remaining: Number(wallet.creditAmount ?? 0) / MICRO,
      asOf,
      estimatedDaysRemaining: null,
    }));
  }

  async provision(p: {
    env: string;
    spec: ProvisionSpec;
  }): Promise<ProvisionOutput> {
    const sdl = buildAkashSdl(p.spec, this.pricing);
    const created = await this.request<{ dseq?: string; manifest?: unknown }>(
      "POST",
      "/v1/deployments",
      { data: { sdl, deposit: this.deployDepositUsd } },
      this.writeTimeoutMs
    );
    const dseq = created?.dseq;
    if (!dseq) {
      throw new AkashComputeError(
        "UNEXPECTED_SHAPE",
        "Console POST /v1/deployments returned no dseq"
      );
    }

    // A dseq means the deployment (and its escrow) exists on-chain — never strand it: from
    // here every failure path (missing manifest, no bids, lease error) closes the deployment
    // (refunding escrow) before rethrowing, and every error names the dseq.
    try {
      if (created?.manifest === undefined) {
        throw new AkashComputeError(
          "UNEXPECTED_SHAPE",
          "Console POST /v1/deployments returned no manifest"
        );
      }
      const bid = await this.awaitCheapestBid(dseq);
      await this.request(
        "POST",
        "/v1/leases",
        {
          manifest: created.manifest,
          leases: [
            {
              dseq: String(bid.dseq ?? dseq),
              gseq: bid.gseq ?? 1,
              oseq: bid.oseq ?? 1,
              provider: bid.provider,
            },
          ],
        },
        this.writeTimeoutMs
      );
    } catch (error) {
      await this.release({ leaseId: String(dseq) }).catch(() => {
        // best-effort close; the original error (now dseq-tagged) is the one that matters
      });
      if (error instanceof AkashComputeError) {
        throw new AkashComputeError(
          error.code,
          `${error.message} (deployment ${dseq} closed, escrow refunding)`
        );
      }
      throw error;
    }

    // The lease exists and is paying from here — a failed/slow status read must NOT throw
    // (the caller would lose the only handle to a live lease). Fall back to `pending`.
    try {
      return await this.status({ leaseId: String(dseq) });
    } catch {
      return {
        provider: PROVIDER,
        leaseId: String(dseq),
        state: "pending",
        endpoints: [],
      };
    }
  }

  async status(p: { leaseId: string }): Promise<ProvisionOutput> {
    const detail = await this.request<ConsoleDeploymentDetail>(
      "GET",
      `/v1/deployments/${encodeURIComponent(p.leaseId)}`
    );
    const leases = detail?.leases ?? [];
    const endpoints = leases.flatMap((lease) => {
      const direct = lease.status?.uris ?? [];
      const perService = Object.values(lease.status?.services ?? {}).flatMap(
        (svc) => svc.uris ?? []
      );
      return [...direct, ...perService];
    });
    return {
      provider: PROVIDER,
      leaseId: p.leaseId,
      state: mapState(detail?.deployment?.state, leases),
      endpoints: [...new Set(endpoints)],
    };
  }

  async release(p: { leaseId: string }): Promise<void> {
    await this.request(
      "DELETE",
      `/v1/deployments/${encodeURIComponent(p.leaseId)}`,
      undefined,
      this.writeTimeoutMs
    );
  }

  /**
   * Poll `/v1/bids` and pick a bid. With `preferredProviders` configured, hold out for a
   * preferred bid until the window closes (preferred providers may bid later than
   * strangers), then fall back to the cheapest open bid; without it, cheapest-first as
   * soon as any bid lands. NO_BIDS when the window elapses with zero open bids.
   */
  private async awaitCheapestBid(dseq: string): Promise<ConsoleBidId> {
    const deadline = Date.now() + this.bidTimeoutMs;
    let bestFallback: ConsoleBidId | undefined;
    for (;;) {
      const bids = await this.request<ConsoleBid[]>(
        "GET",
        `/v1/bids?dseq=${encodeURIComponent(dseq)}`
      );
      const open = (bids ?? []).filter(
        (b) => b.bid?.id?.provider && (b.bid?.state ?? "open") === "open"
      );
      open.sort(
        (a, b) =>
          Number(a.bid?.price?.amount ?? Number.POSITIVE_INFINITY) -
          Number(b.bid?.price?.amount ?? Number.POSITIVE_INFINITY)
      );
      const preferred = this.config.preferredProviders?.length
        ? open.find((b) =>
            this.config.preferredProviders?.includes(b.bid?.id?.provider ?? "")
          )
        : undefined;
      if (preferred?.bid?.id) return preferred.bid.id;
      const cheapest = open[0]?.bid?.id;
      if (cheapest) {
        if (!this.config.preferredProviders?.length) return cheapest;
        bestFallback = cheapest; // keep waiting for a preferred bid until the window closes
      }
      if (Date.now() >= deadline) {
        if (bestFallback) return bestFallback;
        throw new AkashComputeError(
          "NO_BIDS",
          `no provider bids for dseq ${dseq} within ${this.bidTimeoutMs}ms`
        );
      }
      await this.sleep(this.bidPollIntervalMs);
    }
  }

  /** Single Console API request with x-api-key auth, timeout, and `data`-envelope unwrap. */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    timeoutOverrideMs?: number
  ): Promise<T | undefined> {
    const timeoutMs = timeoutOverrideMs ?? this.config.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          "x-api-key": this.config.apiKey,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        // NEVER include raw response text: 4xx bodies can echo request input, and the SDL
        // carries workload secrets — only a parsed, known `message`/`error` field survives.
        const text = await response.text().catch(() => "");
        let detail = "";
        try {
          const parsed = JSON.parse(text) as {
            message?: string;
            error?: string;
          };
          detail = String(parsed.message ?? parsed.error ?? "").slice(0, 200);
        } catch {
          // non-JSON body: drop it
        }
        throw new AkashComputeError(
          "HTTP_ERROR",
          `Console ${method} ${path} failed: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`
        );
      }
      const json = (await response.json().catch(() => undefined)) as
        | { data?: T }
        | T
        | undefined;
      if (json && typeof json === "object" && "data" in json) {
        return (json as { data?: T }).data;
      }
      return json as T | undefined;
    } catch (error) {
      if (error instanceof AkashComputeError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AkashComputeError(
          "TIMEOUT",
          `Console ${method} ${path} timeout after ${timeoutMs}ms`
        );
      }
      throw new AkashComputeError(
        "NETWORK_ERROR",
        error instanceof Error ? error.message : "unknown error"
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function currencyForDenom(denom: string | undefined): string {
  if (denom === "uakt") return "AKT";
  if (denom === undefined || denom === "uact" || denom === "uusdc")
    return "USD";
  return denom; // unknown chain denom: label honestly, never pretend USD
}

function mapState(
  deploymentState: string | undefined,
  leases: ConsoleLease[]
): ProvisionState {
  if (deploymentState === "closed") return "closed";
  if (leases.some((lease) => lease.state === "active")) return "active";
  if (deploymentState === "active") return "pending"; // deployment open, lease not active yet
  return deploymentState === undefined ? "unknown" : "pending";
}

export type AkashComputeErrorCode =
  | "HTTP_ERROR"
  | "UNEXPECTED_SHAPE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "NO_BIDS";

/** Stable error codes for the Akash Console path. */
export class AkashComputeError extends Error {
  constructor(
    public readonly code: AkashComputeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AkashComputeError";
  }
}
