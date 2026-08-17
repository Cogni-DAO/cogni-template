// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `distribution-lifecycle-route.test`
 * Purpose: Prove lifecycle publication state comes only from reconciled on-chain evidence.
 * Scope: Route with attribution store and RPC mocked; no chain or database IO.
 * Invariants: PUBLISH_FROM_ON_CHAIN_EVIDENCE, UNKNOWN_NEVER_COMPLETE.
 * Side-effects: none
 * Links: src/app/api/v1/attribution/distribution-lifecycle/route.ts
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  listEpochs: vi.fn(),
  getDistributionManifestForEpoch: vi.fn(),
}));
const readContract = vi.hoisted(() => vi.fn());
const log = vi.hoisted(() => ({ warn: vi.fn() }));

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
vi.mock("@/shared/config", () => ({ getNodeId: () => "node-1" }));
vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({ attributionStore: store }),
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (
      _options: unknown,
      handler: (ctx: { log: typeof log }) => Promise<Response>
    ) =>
    () =>
      handler({ log }),
}));

import { GET } from "@/app/api/v1/attribution/distribution-lifecycle/route";

const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const epochs = [{ id: 1n }, { id: 2n }];

function manifest(epochId: bigint) {
  return {
    epochId,
    merkleRoot: `0x${epochId.toString().padStart(64, "0")}`,
    chainId: 8453,
    distributorAddress: "0x4444444444444444444444444444444444444444",
  };
}

async function getLifecycle(): Promise<Response> {
  return GET(
    new Request(
      "https://example.test/api/v1/attribution/distribution-lifecycle"
    )
  );
}

describe("GET distribution lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.listEpochs.mockResolvedValue(epochs);
    store.getDistributionManifestForEpoch.mockImplementation(
      async (epochId: bigint) => manifest(epochId)
    );
    readContract.mockResolvedValue(ZERO_ROOT);
  });

  it("reports no manifests as not published without reading RPC", async () => {
    store.getDistributionManifestForEpoch.mockResolvedValue(null);

    const response = await getLifecycle();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      foldedEpochIds: [],
      latestFoldedEpochId: null,
      publishedThroughEpochId: null,
      publicationEvidence: "not_published",
    });
    expect(readContract).not.toHaveBeenCalled();
  });

  it("reports a zero live root as not published", async () => {
    const response = await getLifecycle();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      foldedEpochIds: ["1", "2"],
      latestFoldedEpochId: "2",
      publishedThroughEpochId: null,
      publicationEvidence: "not_published",
    });
  });

  it("matches an older persisted cumulative root", async () => {
    readContract.mockResolvedValue(manifest(1n).merkleRoot);

    const response = await getLifecycle();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      publishedThroughEpochId: "1",
      publicationEvidence: "matched",
    });
  });

  it("matches the latest persisted cumulative root", async () => {
    readContract.mockResolvedValue(manifest(2n).merkleRoot);

    const response = await getLifecycle();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      publishedThroughEpochId: "2",
      publicationEvidence: "matched",
    });
  });

  it("reports an unmatched nonzero root as unknown", async () => {
    readContract.mockResolvedValue(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    );

    const response = await getLifecycle();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      publishedThroughEpochId: null,
      publicationEvidence: "unknown",
    });
  });

  it("reports RPC unavailability as unknown", async () => {
    readContract.mockRejectedValue(new Error("RPC unavailable"));

    const response = await getLifecycle();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      publishedThroughEpochId: null,
      publicationEvidence: "unknown",
    });
    expect(log.warn).toHaveBeenCalled();
  });
});
