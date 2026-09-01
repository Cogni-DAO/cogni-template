// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import {
  Deployment_State,
  Lease_State,
} from "@akashnetwork/chain-sdk/private-types/akash.v1";
import {
  MsgCloseDeployment,
  MsgCreateDeployment,
  QueryDeploymentResponse,
  QueryProviderResponse,
} from "@akashnetwork/chain-sdk/private-types/akash.v1beta4";
import {
  Bid_State,
  MsgCreateLease,
  QueryBidsResponse,
  QueryLeasesResponse,
} from "@akashnetwork/chain-sdk/private-types/akash.v1beta5";
import type { CosmosSignerPort } from "@cogni/operator-wallet";
import { normalizeToLowS } from "@cogni/operator-wallet";
import { Secp256k1, sha256 } from "@cosmjs/crypto";
import { toBase64, toUtf8 } from "@cosmjs/encoding";
import { BaseAccount } from "cosmjs-types/cosmos/auth/v1beta1/auth.js";
import { QueryAccountResponse } from "cosmjs-types/cosmos/auth/v1beta1/query.js";
import { QueryAllBalancesResponse } from "cosmjs-types/cosmos/bank/v1beta1/query.js";
import { TxBody, TxRaw } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { describe, expect, it, vi } from "vitest";

import {
  type AkashGatewayRequest,
  AkashWalletComputeAdapter,
  type AkashWalletComputeAdapterConfig,
  AkashWalletComputeError,
} from "./akash-wallet-compute.adapter";

// --- fake signer (same pattern as packages/operator-wallet/tests/helpers) -----

const TEST_PRIVKEY = sha256(toUtf8("akash-wallet-compute adapter test key v1"));

class FakeCosmosSigner implements CosmosSignerPort {
  private constructor(
    private readonly privkey: Uint8Array,
    private readonly compressedPubkey: Uint8Array
  ) {}

  static async create(): Promise<FakeCosmosSigner> {
    const { pubkey } = await Secp256k1.makeKeypair(TEST_PRIVKEY);
    return new FakeCosmosSigner(TEST_PRIVKEY, Secp256k1.compressPubkey(pubkey));
  }

  async getPublicKey(): Promise<Uint8Array> {
    return this.compressedPubkey;
  }

  async signDigest(digest: Uint8Array): Promise<Uint8Array> {
    const extended = await Secp256k1.createSignature(digest, this.privkey);
    const fixed = new Uint8Array(64);
    fixed.set(extended.r(32), 0);
    fixed.set(extended.s(32), 32);
    return normalizeToLowS(fixed);
  }
}

// --- fake Tendermint JSON-RPC chain ------------------------------------------

interface BroadcastRecord {
  typeUrl: string;
  value: Uint8Array;
}

interface FakeChainOptions {
  height?: number;
  /** Bid waves returned per successive Bids poll (last wave repeats). */
  bidWaves?: readonly (readonly FakeBid[])[];
  balances?: readonly { denom: string; amount: string }[];
  deploymentState?: Deployment_State;
  leaseStates?: readonly Lease_State[];
  hostUri?: string;
  /** When set, `abci_query` for the given path returns this non-zero code. */
  failAbciPath?: { path: string; code: number; log: string };
  broadcastReject?: { code: number; log: string };
}

interface FakeBid {
  provider: string;
  price: string;
  state?: Bid_State;
}

interface FakeChain {
  fetchImpl: typeof fetch;
  broadcasts: BroadcastRecord[];
}

function rpcOk(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function abciOk(value: Uint8Array): unknown {
  return { response: { code: 0, value: toBase64(value) } };
}

function makeFakeChain(owner: string, opts: FakeChainOptions = {}): FakeChain {
  const broadcasts: BroadcastRecord[] = [];
  let bidPoll = 0;
  const height = opts.height ?? 4242;

  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as {
      method: string;
      params: Record<string, unknown>;
    };
    if (request.method === "status") {
      return rpcOk({ sync_info: { latest_block_height: String(height) } });
    }
    if (request.method === "broadcast_tx_sync") {
      const raw = TxRaw.decode(
        Uint8Array.from(Buffer.from(String(request.params.tx), "base64"))
      );
      const body = TxBody.decode(raw.bodyBytes);
      for (const message of body.messages) {
        broadcasts.push({ typeUrl: message.typeUrl, value: message.value });
      }
      if (opts.broadcastReject) {
        return rpcOk({
          code: opts.broadcastReject.code,
          log: opts.broadcastReject.log,
          hash: "AB".repeat(32),
        });
      }
      return rpcOk({ code: 0, log: "", hash: "AB".repeat(32) });
    }
    if (request.method === "tx") {
      return rpcOk({ tx_result: { code: 0, log: "" } });
    }
    if (request.method === "abci_query") {
      const path = String(request.params.path);
      if (opts.failAbciPath && path === opts.failAbciPath.path) {
        return rpcOk({
          response: {
            code: opts.failAbciPath.code,
            log: opts.failAbciPath.log,
            value: null,
          },
        });
      }
      if (path === "/cosmos.auth.v1beta1.Query/Account") {
        const account = BaseAccount.encode(
          BaseAccount.fromPartial({
            address: owner,
            accountNumber: 7n,
            sequence: BigInt(broadcasts.length),
          })
        ).finish();
        const response = QueryAccountResponse.encode(
          QueryAccountResponse.fromPartial({
            account: {
              typeUrl: "/cosmos.auth.v1beta1.BaseAccount",
              value: account,
            },
          })
        ).finish();
        return rpcOk(abciOk(response));
      }
      if (path === "/cosmos.bank.v1beta1.Query/AllBalances") {
        const response = QueryAllBalancesResponse.encode(
          QueryAllBalancesResponse.fromPartial({
            balances: [...(opts.balances ?? [])],
          })
        ).finish();
        return rpcOk(abciOk(response));
      }
      if (path === "/akash.market.v1beta5.Query/Bids") {
        const waves = opts.bidWaves ?? [[]];
        const wave = waves[Math.min(bidPoll, waves.length - 1)] ?? [];
        bidPoll += 1;
        const response = QueryBidsResponse.encode(
          QueryBidsResponse.fromPartial({
            bids: wave.map((bid) => ({
              bid: {
                id: {
                  owner,
                  dseq: BigInt(height),
                  gseq: 1,
                  oseq: 1,
                  provider: bid.provider,
                },
                state: bid.state ?? Bid_State.open,
                price: { denom: "uact", amount: bid.price },
              },
            })),
          })
        ).finish();
        return rpcOk(abciOk(response));
      }
      if (path === "/akash.deployment.v1beta4.Query/Deployment") {
        const response = QueryDeploymentResponse.encode(
          QueryDeploymentResponse.fromPartial({
            deployment: {
              id: { owner, dseq: BigInt(height) },
              state: opts.deploymentState ?? Deployment_State.active,
            },
          })
        ).finish();
        return rpcOk(abciOk(response));
      }
      if (path === "/akash.market.v1beta5.Query/Leases") {
        const response = QueryLeasesResponse.encode(
          QueryLeasesResponse.fromPartial({
            leases: (opts.leaseStates ?? []).map((state) => ({
              lease: {
                id: { owner, dseq: BigInt(height), gseq: 1, oseq: 1 },
                state,
              },
            })),
          })
        ).finish();
        return rpcOk(abciOk(response));
      }
      if (path === "/akash.provider.v1beta4.Query/Provider") {
        const response = QueryProviderResponse.encode(
          QueryProviderResponse.fromPartial({
            provider: { hostUri: opts.hostUri ?? "https://provider.test:8443" },
          })
        ).finish();
        return rpcOk(abciOk(response));
      }
      throw new Error(`unhandled abci path ${path}`);
    }
    throw new Error(`unhandled rpc method ${request.method}`);
  });

  return { fetchImpl, broadcasts };
}

// --- adapter under test -------------------------------------------------------

const SPEC = {
  name: "toks4",
  services: [
    {
      name: "app",
      image: "ghcr.io/cogni-dao/toks4:sha-abc",
      env: { PORT: "3000" },
      cpuUnits: 0.5,
      memoryMi: 1024,
      storageMi: 2048,
      expose: [
        { port: 3000, as: 80, global: true, hosts: ["toks4.example.org"] },
      ],
    },
  ],
} as const;

async function makeAdapter(
  chain: FakeChain,
  overrides: Partial<AkashWalletComputeAdapterConfig> = {}
): Promise<AkashWalletComputeAdapter> {
  return new AkashWalletComputeAdapter({
    signer: await FakeCosmosSigner.create(),
    rpcUrl: "https://rpc.test",
    chainId: "akashnet-2",
    preferredProviders: ["akash1preferred"],
    timeoutMs: 1000,
    bidTimeoutMs: 0,
    bidPollIntervalMs: 0,
    commitTimeoutMs: 1000,
    sleepImpl: async () => {},
    fetchImpl: chain.fetchImpl,
    ...overrides,
  });
}

function decoded<T>(
  record: BroadcastRecord | undefined,
  type: { decode(v: Uint8Array): T; $type: string }
): T {
  expect(record?.typeUrl).toBe(`/${type.$type}`);
  return type.decode((record as BroadcastRecord).value);
}

const CERT = { cert: "-----FAKE CERT-----", key: "-----FAKE KEY-----" };

function fakeGateway(calls: AkashGatewayRequest[], putStatus = 200) {
  return async (req: AkashGatewayRequest) => {
    calls.push(req);
    if (req.method === "PUT") return { status: putStatus, body: "" };
    return {
      status: 200,
      body: JSON.stringify({
        services: { app: { uris: ["toks4.provider.akash.pub"] } },
      }),
    };
  };
}

describe("AkashWalletComputeAdapter balances", () => {
  it("always reports both funding rails: uact deploy runway (USD) and uakt gas runway (AKT)", async () => {
    const chain = makeFakeChain("", {
      balances: [{ denom: "uact", amount: "100000000" }],
    });
    const balances = await (await makeAdapter(chain)).balances();

    expect(balances).toHaveLength(2);
    expect(balances[0]).toEqual(
      expect.objectContaining({
        provider: "akash-wallet",
        currency: "USD",
        remaining: 100,
        estimatedDaysRemaining: null,
      })
    );
    expect(balances[0]?.accountId).toMatch(/^akash1/);
    // uakt row present even with a zero balance — gas runway is signal, not noise.
    expect(balances[1]).toEqual(
      expect.objectContaining({ currency: "AKT", remaining: 0 })
    );
  });
});

describe("AkashWalletComputeAdapter provision", () => {
  it("escrows uact via the shared SDL renderer and leases only the allowlisted bid", async () => {
    const owner = "akash1owner";
    const chain = makeFakeChain(owner, {
      bidWaves: [
        [
          { provider: "akash1stranger", price: "100" }, // cheaper — must be ignored
          { provider: "akash1preferred", price: "900" },
        ],
      ],
      deploymentState: Deployment_State.active,
      leaseStates: [Lease_State.active],
    });
    const gatewayCalls: AkashGatewayRequest[] = [];
    const adapter = await makeAdapter(chain, {
      certPem: CERT,
      gatewayTransport: fakeGateway(gatewayCalls),
      bidTimeoutMs: 1000,
    });

    const out = await adapter.provision({ env: "candidate-a", spec: SPEC });

    const create = decoded(chain.broadcasts[0], MsgCreateDeployment);
    expect(create.deposit?.amount).toEqual({
      denom: "uact",
      amount: "5000000",
    });
    expect(create.groups.length).toBeGreaterThan(0);
    for (const resource of create.groups[0]?.resources ?? []) {
      expect(resource.price?.denom).toBe("uact"); // uakt is rejected at escrow
    }
    expect(create.hash).toHaveLength(32);

    const lease = decoded(chain.broadcasts[1], MsgCreateLease);
    expect(lease.bidId?.provider).toBe("akash1preferred");

    const manifestPut = gatewayCalls.find((c) => c.method === "PUT");
    expect(manifestPut?.url).toBe(
      "https://provider.test:8443/deployment/4242/manifest"
    );
    expect(manifestPut?.certPem).toBe(CERT.cert);

    expect(out).toEqual({
      provider: "akash-wallet",
      leaseId: "4242/1/1/akash1preferred",
      state: "active",
      endpoints: ["toks4.provider.akash.pub"],
    });
  });

  it("throws NO_BIDS on window close (never leasing a cheap stranger) and closes the deployment", async () => {
    const chain = makeFakeChain("akash1owner", {
      bidWaves: [[{ provider: "akash1stranger", price: "1" }]],
    });
    const adapter = await makeAdapter(chain); // bidTimeoutMs 0 → immediate window close

    const error = await adapter
      .provision({ env: "t", spec: SPEC })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AkashWalletComputeError);
    expect((error as AkashWalletComputeError).code).toBe("NO_BIDS");
    expect((error as AkashWalletComputeError).message).toContain("4242");
    expect((error as AkashWalletComputeError).message).toContain("closed");
    const close = decoded(chain.broadcasts.at(-1), MsgCloseDeployment);
    expect(close.id?.dseq).toBe(4242n);
    // No lease was ever created for the stranger.
    expect(
      chain.broadcasts.some((b) => b.typeUrl === `/${MsgCreateLease.$type}`)
    ).toBe(false);
  });

  it("skips the manifest send and returns pending when no client cert is configured", async () => {
    const chain = makeFakeChain("akash1owner", {
      bidWaves: [[{ provider: "akash1preferred", price: "5" }]],
    });
    const gatewayCalls: AkashGatewayRequest[] = [];
    const adapter = await makeAdapter(chain, {
      bidTimeoutMs: 1000,
      gatewayTransport: fakeGateway(gatewayCalls),
    });

    const out = await adapter.provision({ env: "t", spec: SPEC });

    expect(gatewayCalls).toHaveLength(0);
    expect(out).toEqual({
      provider: "akash-wallet",
      leaseId: "4242/1/1/akash1preferred",
      state: "pending",
      endpoints: [],
    });
  });

  it("closes the deployment and rethrows dseq-tagged when the manifest send fails, without echoing the gateway body", async () => {
    const chain = makeFakeChain("akash1owner", {
      bidWaves: [[{ provider: "akash1preferred", price: "5" }]],
    });
    const gatewayCalls: AkashGatewayRequest[] = [];
    const adapter = await makeAdapter(chain, {
      bidTimeoutMs: 1000,
      certPem: CERT,
      gatewayTransport: async (req) => {
        gatewayCalls.push(req);
        return { status: 500, body: "SECRET-PROVIDER-BODY" };
      },
    });

    const error = await adapter
      .provision({ env: "t", spec: SPEC })
      .catch((e: unknown) => e);

    expect((error as AkashWalletComputeError).code).toBe("GATEWAY_ERROR");
    expect((error as AkashWalletComputeError).message).toContain("4242");
    expect((error as AkashWalletComputeError).message).not.toContain(
      "SECRET-PROVIDER-BODY"
    );
    const close = decoded(chain.broadcasts.at(-1), MsgCloseDeployment);
    expect(close.id?.dseq).toBe(4242n);
  });

  it("returns pending instead of throwing when the post-lease status read fails", async () => {
    const chain = makeFakeChain("akash1owner", {
      bidWaves: [[{ provider: "akash1preferred", price: "5" }]],
      failAbciPath: {
        path: "/akash.deployment.v1beta4.Query/Deployment",
        code: 1,
        log: "boom",
      },
    });
    const adapter = await makeAdapter(chain, {
      bidTimeoutMs: 1000,
      certPem: CERT,
      gatewayTransport: fakeGateway([]),
    });

    const out = await adapter.provision({ env: "t", spec: SPEC });

    expect(out).toEqual({
      provider: "akash-wallet",
      leaseId: "4242/1/1/akash1preferred",
      state: "pending",
      endpoints: [],
    });
    // The deployment was NOT closed — the lease is live, only the read degraded.
    expect(
      chain.broadcasts.some((b) => b.typeUrl === `/${MsgCloseDeployment.$type}`)
    ).toBe(false);
  });

  it("surfaces an on-chain broadcast rejection as TX_FAILED with the parsed log only", async () => {
    const chain = makeFakeChain("akash1owner", {
      broadcastReject: { code: 8, log: "Deposit invalid: insufficient funds" },
    });
    const adapter = await makeAdapter(chain);

    const error = await adapter
      .provision({ env: "t", spec: SPEC })
      .catch((e: unknown) => e);

    expect((error as AkashWalletComputeError).code).toBe("TX_FAILED");
    expect((error as AkashWalletComputeError).message).toContain(
      "Deposit invalid"
    );
  });
});

describe("AkashWalletComputeAdapter status/release", () => {
  it("maps a closed deployment and releases via MsgCloseDeployment", async () => {
    const chain = makeFakeChain("akash1owner", {
      deploymentState: Deployment_State.closed,
    });
    const adapter = await makeAdapter(chain);

    const status = await adapter.status({ leaseId: "4242/1/1/akash1p" });
    expect(status.state).toBe("closed");
    expect(status.endpoints).toEqual([]);

    await adapter.release({ leaseId: "4242/1/1/akash1p" });
    const close = decoded(chain.broadcasts.at(-1), MsgCloseDeployment);
    expect(close.id?.dseq).toBe(4242n);
    expect(close.id?.owner).toMatch(/^akash1/);
  });
});

describe("AkashWalletComputeAdapter error taxonomy", () => {
  it("requires a non-empty provider allowlist at construction", async () => {
    const signer = await FakeCosmosSigner.create();
    expect(
      () =>
        new AkashWalletComputeAdapter({
          signer,
          rpcUrl: "https://rpc.test",
          chainId: "akashnet-2",
          preferredProviders: [],
          timeoutMs: 1000,
        })
    ).toThrowError(AkashWalletComputeError);
  });

  it("never echoes raw HTTP bodies on RPC failures", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response("SECRET-RPC-BODY", { status: 500 })
    );
    const adapter = await makeAdapter({ fetchImpl, broadcasts: [] });

    const error = await adapter.balances().catch((e: unknown) => e);

    expect((error as AkashWalletComputeError).code).toBe("RPC_ERROR");
    expect((error as AkashWalletComputeError).message).not.toContain(
      "SECRET-RPC-BODY"
    );
  });

  it("maps an aborted request to TIMEOUT", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    const adapter = await makeAdapter({ fetchImpl, broadcasts: [] });

    const error = await adapter.balances().catch((e: unknown) => e);
    expect((error as AkashWalletComputeError).code).toBe("TIMEOUT");
  });
});
