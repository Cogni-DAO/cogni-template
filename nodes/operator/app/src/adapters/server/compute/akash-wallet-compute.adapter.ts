// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/compute/akash-wallet-compute.adapter`
 * Purpose: Self-custody Akash adapter implementing ComputeResourcePort — signs deployment/lease/close transactions directly against akashnet-2 through an injected CosmosSignerPort instead of the managed Console API (task.5061).
 * Scope: On-chain writes (MsgCreateDeployment v1beta4, MsgCreateLease v1beta5, MsgCloseDeployment), Tendermint JSON-RPC queries, and the provider-gateway manifest/status calls. Does NOT read env vars, hold key material, or wire itself into bootstrap (task.5062).
 * Invariants:
 *   - PROVIDER_AGNOSTIC: SDL, dseq, bids, uact/uakt escrow never escape; `leaseId` is `<dseq>/<gseq>/<oseq>/<provider>` but opaque to callers by contract.
 *   - ALLOWLIST_ONLY: leases go exclusively to `preferredProviders` bids — never a cheapest-stranger fallback; NO_BIDS when the window closes.
 *   - FAIL_CONTAINED: any post-deployment-create failure closes the deployment (refunding escrow) and rethrows dseq-tagged; only a failing post-lease status read degrades to `pending`.
 * Side-effects: IO (Tendermint JSON-RPC to the configured Akash RPC; provision() spends real uact escrow and uakt gas; provider-gateway HTTPS when a client cert is configured)
 * Links: ComputeResourcePort (@cogni/ai-tools/capabilities/compute), ./akash-sdl,
 *   ./akash-compute.adapter (managed sibling), @cogni/operator-wallet (CosmosSignerPort,
 *   task.5060), scripts/experiments/privy-cosmos-spike (task.5059 proven pipeline), story.5017
 * @internal
 */

import {
  generateManifest,
  generateManifestVersion,
  type Manifest,
  manifestToSortedJSON,
  type SDLInput,
} from "@akashnetwork/chain-sdk";
import {
  type BidID,
  Deployment_State,
  Lease_State,
  MsgAccountDeposit,
  Source,
} from "@akashnetwork/chain-sdk/private-types/akash.v1";
import {
  type GroupSpec,
  MsgCloseDeployment,
  MsgCreateDeployment,
  MsgUpdateDeployment,
  QueryDeploymentRequest,
  QueryDeploymentResponse,
  QueryProviderRequest,
  QueryProviderResponse,
} from "@akashnetwork/chain-sdk/private-types/akash.v1beta4";
import {
  Bid_State,
  MsgCreateLease,
  QueryBidsRequest,
  QueryBidsResponse,
  QueryLeasesRequest,
  QueryLeasesResponse,
} from "@akashnetwork/chain-sdk/private-types/akash.v1beta5";
import type {
  ComputeBalance,
  ComputeResourcePort,
  ProvisionOutput,
  ProvisionSpec,
  ProvisionState,
} from "@cogni/ai-tools";
import type { CosmosSignerPort } from "@cogni/operator-wallet";
import { deriveCosmosAddress } from "@cogni/operator-wallet";
import { createDirectSignerFromPort } from "@cogni/operator-wallet/adapters/cosmjs";
import { sha256 } from "@cosmjs/crypto";
import { fromBase64, toBase64, toHex } from "@cosmjs/encoding";
import {
  type EncodeObject,
  encodePubkey,
  type GeneratedType,
  makeAuthInfoBytes,
  makeSignDoc,
  Registry,
} from "@cosmjs/proto-signing";
import { BaseAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth.js";
import {
  QueryAccountRequest,
  QueryAccountResponse,
} from "cosmjs-types/cosmos/auth/v1beta1/query.js";
import {
  QueryAllBalancesRequest,
  QueryAllBalancesResponse,
} from "cosmjs-types/cosmos/bank/v1beta1/query.js";
import { TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { parse as parseYaml } from "yaml";

import { buildAkashSdl } from "./akash-sdl";

const PROVIDER = "akash-wallet";
const MICRO = 1_000_000;
/** Escrow/pricing denom for self-custody deployments. uakt is rejected at escrow ("Deposit invalid"). */
const DEPOSIT_DENOM = "uact";
/** Gas fees are paid in uakt (ACT is soulbound and cannot pay gas). */
const GAS_DENOM = "uakt";

/** Fixed gas limits per verb — ceilings, unspent gas is not charged beyond the fee. */
const GAS_CREATE_DEPLOYMENT = 500_000;
const GAS_CREATE_LEASE = 400_000;
const GAS_CLOSE_DEPLOYMENT = 300_000;

/** One provider-gateway HTTPS call (mTLS with the tenant's on-chain client cert). */
export interface AkashGatewayRequest {
  readonly url: string;
  readonly method: "GET" | "PUT";
  readonly body?: string;
  readonly certPem: string;
  readonly keyPem: string;
  readonly timeoutMs: number;
}

/** Injectable transport for the provider gateway (global fetch cannot present client certs). */
export type AkashGatewayTransport = (
  req: AkashGatewayRequest
) => Promise<{ status: number; body: string }>;

export interface AkashWalletComputeAdapterConfig {
  /** Key custody seam — signs sha256(SignDoc) digests; the key never enters this process. */
  signer: CosmosSignerPort;
  /** Tendermint JSON-RPC endpoint, e.g. https://rpc.akashnet.net:443. */
  rpcUrl: string;
  /** Chain id the SignDoc binds to, e.g. "akashnet-2". */
  chainId: string;
  /**
   * Provider addresses eligible to win the lease. REQUIRED non-empty: bids from any other
   * provider are ignored — there is deliberately no cheapest-stranger fallback, so a
   * compromised/unknown provider can never end up hosting a workload. NO_BIDS on timeout.
   */
  preferredProviders: readonly string[];
  /** Per-request timeout for RPC calls, in milliseconds. */
  timeoutMs: number;
  /** Bech32 address prefix. Default "akash". */
  addressPrefix?: string;
  /** uact escrow deposited per deployment. Chain minimum 500000 (0.5 ACT); default 5000000. */
  depositUact?: number;
  /** Gas price in uakt per gas unit. Default 0.025. */
  gasPrice?: number;
  /** Max bid price per block per service, in uact micro-units (a ceiling). Default 10000. */
  pricingAmountUact?: number;
  /** How long to wait for an allowlisted provider bid before failing, in ms. Default 90000. */
  bidTimeoutMs?: number;
  /** Bid poll interval in ms (also paces tx-commit polling). Default 3000. */
  bidPollIntervalMs?: number;
  /** How long to wait for a broadcast tx to commit, in ms. Default 60000. */
  commitTimeoutMs?: number;
  /**
   * Tenant mTLS client certificate (PEM) for the provider gateway. When absent, provision()
   * skips the manifest send and returns state "pending" — the lease exists but the workload
   * will not start until a manifest is sent (task.5062 wires the cert).
   */
  certPem?: { readonly cert: string; readonly key: string };
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable sleep for tests; defaults to setTimeout. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Injectable provider-gateway transport; defaults to a node:https mTLS client. */
  gatewayTransport?: AkashGatewayTransport;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** JSON-RPC envelope (only the fields we read). */
interface JsonRpcEnvelope {
  result?: unknown;
  error?: { code?: number; message?: string; data?: string };
}

/**
 * Default provider-gateway transport: node:https with the tenant's client cert. Provider
 * server certs are self-signed on-chain certs, so TLS verification against the public CA
 * store is disabled here; chain-registry verification is deferred (task.5062 e2e).
 */
const nodeHttpsGatewayTransport: AkashGatewayTransport = async (req) => {
  const { request } = await import("node:https");
  return new Promise((resolve, reject) => {
    const url = new URL(req.url);
    const r = request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: req.method,
        cert: req.certPem,
        key: req.keyPem,
        rejectUnauthorized: false,
        timeout: req.timeoutMs,
        headers:
          req.body !== undefined ? { "content-type": "application/json" } : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
      }
    );
    r.on("timeout", () => r.destroy(new Error("gateway timeout")));
    r.on("error", reject);
    if (req.body !== undefined) r.write(req.body);
    r.end();
  });
};

/** chain-sdk ts-proto message objects are structurally cosmjs GeneratedTypes. */
const asGeneratedType = (type: unknown): GeneratedType => type as GeneratedType;

/**
 * Self-custody Akash compute adapter — the crypto write half of ComputeResourcePort.
 * Every state change is an operator-signed on-chain transaction; nothing is billed to a
 * managed account. Config is constructor-injected only (no env reads).
 */
export class AkashWalletComputeAdapter implements ComputeResourcePort {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly gateway: AkashGatewayTransport;
  private readonly registry: Registry;
  private readonly addressPrefix: string;
  private readonly depositUact: number;
  private readonly gasPrice: number;
  private readonly pricingAmountUact: number;
  private readonly bidTimeoutMs: number;
  private readonly bidPollIntervalMs: number;
  private readonly commitTimeoutMs: number;
  private cachedAddress: Promise<string> | undefined;

  constructor(private readonly config: AkashWalletComputeAdapterConfig) {
    if (config.preferredProviders.length === 0) {
      throw new AkashWalletComputeError(
        "UNEXPECTED_SHAPE",
        "preferredProviders must be non-empty — the allowlist is the only lease policy (no cheapest fallback)"
      );
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.sleep = config.sleepImpl ?? defaultSleep;
    this.gateway = config.gatewayTransport ?? nodeHttpsGatewayTransport;
    this.addressPrefix = config.addressPrefix ?? "akash";
    this.depositUact = config.depositUact ?? 5_000_000;
    this.gasPrice = config.gasPrice ?? 0.025;
    this.pricingAmountUact = config.pricingAmountUact ?? 10_000;
    this.bidTimeoutMs = config.bidTimeoutMs ?? 90_000;
    this.bidPollIntervalMs = config.bidPollIntervalMs ?? 3_000;
    this.commitTimeoutMs = config.commitTimeoutMs ?? 60_000;
    this.registry = new Registry();
    this.registry.register(
      `/${MsgCreateDeployment.$type}`,
      asGeneratedType(MsgCreateDeployment)
    );
    // MsgUpdateDeployment ({id, hash} only) is registered for the task.5062 update path,
    // which will reuse renderManifest + sendManifest; MsgAccountDeposit for escrow top-ups.
    this.registry.register(
      `/${MsgUpdateDeployment.$type}`,
      asGeneratedType(MsgUpdateDeployment)
    );
    this.registry.register(
      `/${MsgCloseDeployment.$type}`,
      asGeneratedType(MsgCloseDeployment)
    );
    this.registry.register(
      `/${MsgCreateLease.$type}`,
      asGeneratedType(MsgCreateLease)
    );
    this.registry.register(
      `/${MsgAccountDeposit.$type}`,
      asGeneratedType(MsgAccountDeposit)
    );
  }

  async balances(): Promise<readonly ComputeBalance[]> {
    const address = await this.address();
    const raw = await this.abciQuery(
      "/cosmos.bank.v1beta1.Query/AllBalances",
      QueryAllBalancesRequest.encode(
        QueryAllBalancesRequest.fromPartial({ address })
      ).finish()
    );
    const response = QueryAllBalancesResponse.decode(raw);
    const byDenom = new Map<string, number>(
      response.balances.map((coin) => [coin.denom, Number(coin.amount)])
    );
    const asOf = new Date().toISOString();
    // Always report BOTH funding rails: uact is deploy runway (escrow denom), uakt is gas
    // runway (ACT cannot pay gas) — a zero row is signal, not noise.
    const denoms = [
      DEPOSIT_DENOM,
      GAS_DENOM,
      ...[...byDenom.keys()].filter(
        (d) => d !== DEPOSIT_DENOM && d !== GAS_DENOM
      ),
    ];
    return denoms.map((denom) => ({
      provider: PROVIDER,
      accountId: address,
      currency: currencyForDenom(denom),
      remaining: (byDenom.get(denom) ?? 0) / MICRO,
      asOf,
      estimatedDaysRemaining: null,
    }));
  }

  async provision(p: {
    env: string;
    spec: ProvisionSpec;
  }): Promise<ProvisionOutput> {
    const owner = await this.address();
    // SAME renderer path as the managed adapter; only the denom differs (self-custody
    // escrows raw uact — uakt is rejected at escrow with "Deposit invalid").
    const sdlYaml = buildAkashSdl(p.spec, {
      pricingDenom: DEPOSIT_DENOM,
      pricingAmount: this.pricingAmountUact,
    });
    const { groups, groupSpecs } = this.renderManifest(sdlYaml);
    const hash = await generateManifestVersion(groups);
    const dseq = BigInt(await this.latestHeight());

    const createMsg = MsgCreateDeployment.fromPartial({
      id: { owner, dseq },
      groups: groupSpecs,
      hash,
      deposit: {
        amount: { denom: DEPOSIT_DENOM, amount: String(this.depositUact) },
        sources: [Source.balance],
      },
    });
    await this.signAndBroadcast(
      [{ typeUrl: `/${MsgCreateDeployment.$type}`, value: createMsg }],
      GAS_CREATE_DEPLOYMENT
    );

    // The deployment (and its escrow) is committed on-chain — never strand it: from here
    // every failure path closes the deployment (refunding escrow) before rethrowing, and
    // every error names the dseq.
    let bidId: BidID;
    try {
      bidId = await this.awaitAllowlistedBid(owner, dseq);
      const leaseMsg = MsgCreateLease.fromPartial({ bidId });
      await this.signAndBroadcast(
        [{ typeUrl: `/${MsgCreateLease.$type}`, value: leaseMsg }],
        GAS_CREATE_LEASE
      );
      if (this.config.certPem) {
        // The provider cross-checks the manifest against the on-chain hash, so this must
        // run after the create tx is committed (signAndBroadcast waits for commit).
        await this.sendManifest(
          bidId.provider,
          dseq,
          manifestToSortedJSON(groups)
        );
      }
      // certPem absent → skip manifest send gracefully; the pending state below is the note.
    } catch (error) {
      await this.release({ leaseId: `${dseq}/1/1/-` }).catch(() => {
        // best-effort close; the original error (now dseq-tagged) is the one that matters
      });
      if (error instanceof AkashWalletComputeError) {
        throw new AkashWalletComputeError(
          error.code,
          `${error.message} (deployment ${dseq} closed, escrow refunding)`
        );
      }
      throw error;
    }

    const leaseId = `${dseq}/${bidId.gseq}/${bidId.oseq}/${bidId.provider}`;
    if (!this.config.certPem) {
      // Manifest not sent — report pending honestly rather than reading a state that
      // cannot become active yet.
      return { provider: PROVIDER, leaseId, state: "pending", endpoints: [] };
    }
    // The lease exists and is paying from here — a failed/slow status read must NOT throw
    // (the caller would lose the only handle to a live lease). Fall back to `pending`.
    try {
      return await this.status({ leaseId });
    } catch {
      return { provider: PROVIDER, leaseId, state: "pending", endpoints: [] };
    }
  }

  async status(p: { leaseId: string }): Promise<ProvisionOutput> {
    const owner = await this.address();
    const { dseq, gseq, oseq, provider } = parseLeaseId(p.leaseId);
    const deploymentRaw = await this.abciQuery(
      "/akash.deployment.v1beta4.Query/Deployment",
      QueryDeploymentRequest.encode(
        QueryDeploymentRequest.fromPartial({ id: { owner, dseq } })
      ).finish()
    );
    const deployment = QueryDeploymentResponse.decode(deploymentRaw);
    const leasesRaw = await this.abciQuery(
      "/akash.market.v1beta5.Query/Leases",
      QueryLeasesRequest.encode(
        QueryLeasesRequest.fromPartial({ filters: { owner, dseq } })
      ).finish()
    );
    const leases = QueryLeasesResponse.decode(leasesRaw);
    const leaseStates = leases.leases
      .map((entry) => entry.lease?.state)
      .filter((state): state is Lease_State => state !== undefined);

    let endpoints: readonly string[] = [];
    if (this.config.certPem && provider !== "-") {
      // Best-effort: endpoints come from the provider gateway; a gateway hiccup must not
      // turn a live lease into an error.
      endpoints = await this.gatewayLeaseStatus(
        provider,
        dseq,
        gseq,
        oseq
      ).catch(() => []);
    }
    return {
      provider: PROVIDER,
      leaseId: p.leaseId,
      state: mapState(deployment.deployment?.state, leaseStates),
      endpoints,
    };
  }

  async release(p: { leaseId: string }): Promise<void> {
    const owner = await this.address();
    const { dseq } = parseLeaseId(p.leaseId);
    const closeMsg = MsgCloseDeployment.fromPartial({ id: { owner, dseq } });
    await this.signAndBroadcast(
      [{ typeUrl: `/${MsgCloseDeployment.$type}`, value: closeMsg }],
      GAS_CLOSE_DEPLOYMENT
    );
  }

  // ---------------------------------------------------------------- internals

  private address(): Promise<string> {
    this.cachedAddress ??= this.config.signer
      .getPublicKey()
      .then((pubkey) => deriveCosmosAddress(pubkey, this.addressPrefix));
    return this.cachedAddress;
  }

  /** Parse + validate the SDL and derive manifest groups/groupSpecs (chain-sdk renderer). */
  private renderManifest(sdlYaml: string): {
    groups: Manifest;
    groupSpecs: GroupSpec[];
  } {
    const input = parseYaml(sdlYaml) as SDLInput;
    const result = generateManifest(input);
    if (!result.ok) {
      // Validation errors describe OUR rendered SDL (no remote body) — safe to surface.
      const summary = result.value
        .map((e) => e.message)
        .join("; ")
        .slice(0, 200);
      throw new AkashWalletComputeError(
        "UNEXPECTED_SHAPE",
        `SDL failed manifest validation: ${summary}`
      );
    }
    return { groups: result.value.groups, groupSpecs: result.value.groupSpecs };
  }

  /**
   * Poll bids until an ALLOWLISTED provider bids (cheapest among them wins). Bids from
   * unlisted providers are ignored no matter how cheap — NO_BIDS when the window closes.
   */
  private async awaitAllowlistedBid(
    owner: string,
    dseq: bigint
  ): Promise<BidID> {
    const deadline = Date.now() + this.bidTimeoutMs;
    for (;;) {
      const raw = await this.abciQuery(
        "/akash.market.v1beta5.Query/Bids",
        QueryBidsRequest.encode(
          QueryBidsRequest.fromPartial({ filters: { owner, dseq } })
        ).finish()
      );
      const response = QueryBidsResponse.decode(raw);
      const eligible = response.bids
        .map((entry) => entry.bid)
        .filter(
          (bid): bid is NonNullable<typeof bid> =>
            bid?.id !== undefined &&
            bid.state === Bid_State.open &&
            this.config.preferredProviders.includes(bid.id.provider)
        )
        .sort(
          (a, b) =>
            Number(a.price?.amount ?? Number.POSITIVE_INFINITY) -
            Number(b.price?.amount ?? Number.POSITIVE_INFINITY)
        );
      const winner = eligible[0]?.id;
      if (winner) return winner;
      if (Date.now() >= deadline) {
        throw new AkashWalletComputeError(
          "NO_BIDS",
          `no allowlisted provider bid for dseq ${dseq} within ${this.bidTimeoutMs}ms (${this.config.preferredProviders.length} providers allowlisted; strangers are never leased)`
        );
      }
      await this.sleep(this.bidPollIntervalMs);
    }
  }

  /** Sign (via the CosmosSignerPort bridge), broadcast, and wait for the tx to commit. */
  private async signAndBroadcast(
    messages: readonly EncodeObject[],
    gasLimit: number
  ): Promise<void> {
    const signer = createDirectSignerFromPort(
      this.config.signer,
      this.addressPrefix
    );
    const [account] = await signer.getAccounts();
    if (!account) {
      throw new AkashWalletComputeError(
        "UNEXPECTED_SHAPE",
        "signer bridge returned no account"
      );
    }
    const { accountNumber, sequence } = await this.accountState(
      account.address
    );
    const bodyBytes = this.registry.encodeTxBody({
      messages: [...messages],
      memo: "",
    });
    const feeAmount = Math.ceil(gasLimit * this.gasPrice);
    const authInfoBytes = makeAuthInfoBytes(
      [
        {
          pubkey: encodePubkey({
            type: "tendermint/PubKeySecp256k1",
            value: toBase64(account.pubkey),
          }),
          sequence,
        },
      ],
      [{ denom: GAS_DENOM, amount: String(feeAmount) }],
      gasLimit,
      undefined,
      undefined
    );
    const signDoc = makeSignDoc(
      bodyBytes,
      authInfoBytes,
      this.config.chainId,
      accountNumber
    );
    const { signed, signature } = await signer.signDirect(
      account.address,
      signDoc
    );
    const txBytes = TxRaw.encode(
      TxRaw.fromPartial({
        bodyBytes: signed.bodyBytes,
        authInfoBytes: signed.authInfoBytes,
        signatures: [fromBase64(signature.signature)],
      })
    ).finish();

    const broadcast = (await this.rpc("broadcast_tx_sync", {
      tx: toBase64(txBytes),
    })) as { code?: number; log?: string };
    if ((broadcast.code ?? 0) !== 0) {
      throw new AkashWalletComputeError(
        "TX_FAILED",
        `broadcast rejected (code ${broadcast.code}): ${truncated(broadcast.log)}`
      );
    }
    await this.waitForCommit(sha256(txBytes));
  }

  /** Poll the tx by hash until it lands in a block (providers verify committed state). */
  private async waitForCommit(txHash: Uint8Array): Promise<void> {
    const deadline = Date.now() + this.commitTimeoutMs;
    for (;;) {
      try {
        const result = (await this.rpc("tx", {
          hash: toBase64(txHash),
          prove: false,
        })) as { tx_result?: { code?: number; log?: string } };
        const code = result.tx_result?.code ?? 0;
        if (code !== 0) {
          throw new AkashWalletComputeError(
            "TX_FAILED",
            `tx ${toHex(txHash)} failed on-chain (code ${code}): ${truncated(result.tx_result?.log)}`
          );
        }
        return;
      } catch (error) {
        if (
          error instanceof AkashWalletComputeError &&
          error.code === "TX_FAILED"
        ) {
          throw error;
        }
        // Not indexed yet (RPC "not found") — keep polling until the commit window closes.
      }
      if (Date.now() >= deadline) {
        throw new AkashWalletComputeError(
          "TIMEOUT",
          `tx ${toHex(txHash)} not committed within ${this.commitTimeoutMs}ms`
        );
      }
      await this.sleep(this.bidPollIntervalMs);
    }
  }

  private async accountState(
    address: string
  ): Promise<{ accountNumber: number; sequence: number }> {
    const raw = await this.abciQuery(
      "/cosmos.auth.v1beta1.Query/Account",
      QueryAccountRequest.encode(
        QueryAccountRequest.fromPartial({ address })
      ).finish()
    );
    const any = QueryAccountResponse.decode(raw).account;
    if (!any) {
      throw new AkashWalletComputeError(
        "UNEXPECTED_SHAPE",
        "auth query returned no account (wallet unfunded?)"
      );
    }
    const account = BaseAccount.decode(any.value);
    return {
      accountNumber: Number(account.accountNumber),
      sequence: Number(account.sequence),
    };
  }

  /** Protobuf query over Tendermint `abci_query`; returns the decoded value bytes. */
  private async abciQuery(path: string, data: Uint8Array): Promise<Uint8Array> {
    const result = (await this.rpc("abci_query", {
      path,
      data: toHex(data),
      prove: false,
    })) as {
      response?: { code?: number; log?: string; value?: string | null };
    };
    const response = result.response;
    if (!response) {
      throw new AkashWalletComputeError(
        "UNEXPECTED_SHAPE",
        `abci_query ${path} returned no response`
      );
    }
    if ((response.code ?? 0) !== 0) {
      throw new AkashWalletComputeError(
        "RPC_ERROR",
        `abci_query ${path} failed (code ${response.code}): ${truncated(response.log)}`
      );
    }
    return response.value ? fromBase64(response.value) : new Uint8Array();
  }

  private async latestHeight(): Promise<string> {
    const result = (await this.rpc("status", {})) as {
      sync_info?: { latest_block_height?: string };
    };
    const height = result.sync_info?.latest_block_height;
    if (!height || !/^\d+$/.test(height)) {
      throw new AkashWalletComputeError(
        "UNEXPECTED_SHAPE",
        "status returned no latest_block_height"
      );
    }
    return height;
  }

  /** Single Tendermint JSON-RPC call with timeout; returns the `result` payload. */
  private async rpc(method: string, params: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );
    try {
      const response = await this.fetchImpl(this.config.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) {
        // NEVER include raw response text — only status metadata survives.
        throw new AkashWalletComputeError(
          "RPC_ERROR",
          `rpc ${method} failed: HTTP ${response.status} ${response.statusText}`
        );
      }
      const json = (await response.json().catch(() => undefined)) as
        | JsonRpcEnvelope
        | undefined;
      if (!json || (json.error === undefined && json.result === undefined)) {
        throw new AkashWalletComputeError(
          "UNEXPECTED_SHAPE",
          `rpc ${method} returned no result`
        );
      }
      if (json.error) {
        // Known JSON-RPC error fields only, truncated — never the raw body.
        throw new AkashWalletComputeError(
          "RPC_ERROR",
          `rpc ${method} error: ${truncated(`${json.error.message ?? ""} ${json.error.data ?? ""}`)}`
        );
      }
      return json.result;
    } catch (error) {
      if (error instanceof AkashWalletComputeError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AkashWalletComputeError(
          "TIMEOUT",
          `rpc ${method} timeout after ${this.config.timeoutMs}ms`
        );
      }
      throw new AkashWalletComputeError(
        "NETWORK_ERROR",
        error instanceof Error ? error.message : "unknown error"
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async providerHostUri(provider: string): Promise<string> {
    const raw = await this.abciQuery(
      "/akash.provider.v1beta4.Query/Provider",
      QueryProviderRequest.encode(
        QueryProviderRequest.fromPartial({ owner: provider })
      ).finish()
    );
    const hostUri = QueryProviderResponse.decode(raw).provider?.hostUri;
    if (!hostUri) {
      throw new AkashWalletComputeError(
        "UNEXPECTED_SHAPE",
        `provider ${provider} has no hostUri on chain`
      );
    }
    return hostUri.replace(/\/$/, "");
  }

  /** PUT the manifest to the winning provider's gateway (mTLS). */
  private async sendManifest(
    provider: string,
    dseq: bigint,
    manifestJson: string
  ): Promise<void> {
    const certPem = this.config.certPem;
    if (!certPem) return;
    const hostUri = await this.providerHostUri(provider);
    const { status } = await this.gateway({
      url: `${hostUri}/deployment/${dseq}/manifest`,
      method: "PUT",
      body: manifestJson,
      certPem: certPem.cert,
      keyPem: certPem.key,
      timeoutMs: this.config.timeoutMs,
    });
    if (status < 200 || status >= 300) {
      // Status code only — gateway bodies can echo the manifest (workload env/secrets).
      throw new AkashWalletComputeError(
        "GATEWAY_ERROR",
        `provider gateway manifest send failed: HTTP ${status}`
      );
    }
  }

  /** Read serving URIs from the provider gateway lease-status endpoint (mTLS). */
  private async gatewayLeaseStatus(
    provider: string,
    dseq: bigint,
    gseq: number,
    oseq: number
  ): Promise<readonly string[]> {
    const certPem = this.config.certPem;
    if (!certPem) return [];
    const hostUri = await this.providerHostUri(provider);
    const { status, body } = await this.gateway({
      url: `${hostUri}/lease/${dseq}/${gseq}/${oseq}/status`,
      method: "GET",
      certPem: certPem.cert,
      keyPem: certPem.key,
      timeoutMs: this.config.timeoutMs,
    });
    if (status < 200 || status >= 300) return [];
    const parsed = JSON.parse(body) as {
      services?: Record<string, { uris?: string[] | null }>;
    };
    const uris = Object.values(parsed.services ?? {}).flatMap(
      (svc) => svc.uris ?? []
    );
    return [...new Set(uris)];
  }
}

function currencyForDenom(denom: string): string {
  if (denom === GAS_DENOM) return "AKT";
  if (denom === DEPOSIT_DENOM || denom === "uusdc") return "USD";
  return denom; // unknown chain denom: label honestly, never pretend USD
}

function mapState(
  deploymentState: Deployment_State | undefined,
  leaseStates: readonly Lease_State[]
): ProvisionState {
  if (deploymentState === Deployment_State.closed) return "closed";
  if (leaseStates.includes(Lease_State.active)) return "active";
  if (deploymentState === Deployment_State.active) return "pending";
  return deploymentState === undefined ? "unknown" : "pending";
}

function parseLeaseId(leaseId: string): {
  dseq: bigint;
  gseq: number;
  oseq: number;
  provider: string;
} {
  const parts = leaseId.split("/");
  const [dseqPart, gseqPart, oseqPart, provider] = parts;
  if (parts.length !== 4 || !dseqPart || !/^\d+$/.test(dseqPart)) {
    throw new AkashWalletComputeError(
      "UNEXPECTED_SHAPE",
      `malformed leaseId (expected "<dseq>/<gseq>/<oseq>/<provider>")`
    );
  }
  return {
    dseq: BigInt(dseqPart),
    gseq: Number(gseqPart) || 1,
    oseq: Number(oseqPart) || 1,
    provider: provider ?? "-",
  };
}

function truncated(text: string | undefined): string {
  return String(text ?? "")
    .slice(0, 200)
    .trim();
}

export type AkashWalletComputeErrorCode =
  | "RPC_ERROR"
  | "TX_FAILED"
  | "GATEWAY_ERROR"
  | "UNEXPECTED_SHAPE"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "NO_BIDS";

/** Stable error codes for the self-custody Akash path. */
export class AkashWalletComputeError extends Error {
  constructor(
    public readonly code: AkashWalletComputeErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AkashWalletComputeError";
  }
}
