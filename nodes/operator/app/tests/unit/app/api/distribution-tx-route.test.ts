// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `distribution-tx-route.test`
 * Purpose: Prove publish payload reads are viewer-visible while superseded roots remain unpublishable.
 * Scope: Route with DB/store/RPC mocked; no chain or database IO.
 * Invariants: ACTION_AUTHORITY_ON_CHAIN, LATEST_MANIFEST_ONLY, UNKNOWN_NEVER_PUBLISHABLE.
 * Side-effects: none
 * Links: src/app/api/v1/nodes/[id]/attribution/epochs/[eid]/distribution-tx/route.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  getEpoch: vi.fn(),
  getDistributionManifestForEpoch: vi.fn(),
  listEpochs: vi.fn(),
}));
const readContract = vi.hoisted(() => vi.fn());
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));

const node = {
  id: "node-1",
  slug: "operator",
  ownerUserId: "different-user",
  daoAddress: "0x1111111111111111111111111111111111111111",
};

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: () => ({ readContract }),
    http: vi.fn(() => ({})),
  };
});
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({ EVM_RPC_URL: "https://rpc.example.test" }),
}));
vi.mock("@/features/nodes/node-lookup", () => ({
  nodeIdOrSlug: () => ({}),
}));
vi.mock("@/shared/db/nodes", () => ({ nodes: {} }));
vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({ attributionStore: store }),
  resolveServiceDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [node] }),
      }),
    }),
  }),
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (
      _options: unknown,
      handler: (
        ctx: { log: typeof log },
        request: Request,
        user: { id: string },
        context: { params: Promise<{ id: string; eid: string }> }
      ) => Promise<Response>
    ) =>
    (
      request: Request,
      context: { params: Promise<{ id: string; eid: string }> }
    ) =>
      handler({ log }, request, { id: "ordinary-viewer" }, context),
}));

import { GET } from "@/app/api/v1/nodes/[id]/attribution/epochs/[eid]/distribution-tx/route";

const epoch1 = { id: 1n, nodeId: node.id, status: "finalized" as const };
const epoch2 = { id: 2n, nodeId: node.id, status: "finalized" as const };

function manifest(epochId: bigint, amount: bigint) {
  return {
    id: `manifest-${epochId}`,
    nodeId: node.id,
    scopeId: "scope-1",
    epochId,
    distributionId: `distribution-${epochId}`,
    statementHash: `statement-${epochId}`,
    merkleRoot: `0x${epochId.toString().padStart(64, "0")}`,
    chainId: 8453,
    tokenAddress: "0x3333333333333333333333333333333333333333",
    distributionAmount: amount,
    totalAllocated: amount,
    distributorAddress: "0x4444444444444444444444444444444444444444",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function getPayload(epochId: string): Promise<Response> {
  return GET(
    new Request(
      `https://example.test/api/v1/nodes/operator/attribution/epochs/${epochId}/distribution-tx`
    ),
    { params: Promise.resolve({ id: "operator", eid: epochId }) }
  );
}

describe("GET distribution publish payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.listEpochs.mockResolvedValue([epoch1, epoch2]);
    store.getEpoch.mockImplementation(async (id: bigint) =>
      id === 1n ? epoch1 : epoch2
    );
    store.getDistributionManifestForEpoch.mockImplementation(
      async (id: bigint) =>
        id === 1n ? manifest(1n, 100n) : manifest(2n, 150n)
    );
    readContract.mockResolvedValue(
      "0x0000000000000000000000000000000000000000000000000000000000000000"
    );
  });

  it("mints the full latest cumulative total when the live root is zero", async () => {
    const response = await getPayload("2");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      epochId: "2",
      mintDelta: "150",
    });
  });

  it("subtracts the cumulative total whose prior root is actually live", async () => {
    readContract.mockResolvedValue(manifest(1n, 100n).merkleRoot);

    const response = await getPayload("2");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      epochId: "2",
      mintDelta: "50",
    });
  });

  it("refuses a superseded manifest", async () => {
    const response = await getPayload("1");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "superseded_manifest",
      latestEpochId: "2",
    });
    expect(readContract).not.toHaveBeenCalled();
  });

  it("refuses to offer a mint when the live root cannot be read", async () => {
    readContract.mockRejectedValue(new Error("RPC unavailable"));
    const response = await getPayload("2");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "publication_state_unknown",
    });
  });

  it("refuses to infer funding from an unmatched nonzero live root", async () => {
    readContract.mockResolvedValue(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const response = await getPayload("2");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "publication_state_unknown",
    });
  });
});
