// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/app/attribution.tokenomics`
 * Purpose: Contract tests for GET /api/v1/public/attribution/tokenomics — the node's public
 *   tokenomics identity (token, distributor, chain id, finalized-epoch count).
 * Scope: Exercises the real wrapPublicRoute() handler with a mocked attributionStore + repo-spec
 *   config; verifies the DTO shape and that epochsCompleted counts finalized epochs only. Does NOT
 *   hit a real DB or chain.
 * Invariants: CONFIG_NOT_MANIFEST (token/distributor/chain from repo-spec), PUBLIC_READS_FINALIZED_ONLY,
 *   MANIFEST_INDEPENDENT (renders with zero completed epochs), NO_SECRETS.
 * Side-effects: none (container + node-id + config + rate limiter mocked)
 * Links: src/app/api/v1/public/attribution/tokenomics/route
 * @public
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_NODE_ID = "00000000-0000-4000-a000-000000000001";
const TEST_TOKEN = "0x0166Db3d42603E790Fb685059DcAa37087B032c8";
const TEST_DISTRIBUTOR = "0x717a747df71111a678202BfCD2E3B0081A9aeB56";

// --- Mocks ---

const mockAttributionStore = {
  listEpochs: vi.fn(),
};

// wrapPublicRoute + its logging wrapper read container.{log,clock,config};
// the route reads container.attributionStore.
vi.mock("@/bootstrap/container", () => ({
  getContainer: vi.fn(() => ({
    log: {
      child: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      })),
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    clock: { now: vi.fn(() => new Date("2025-01-01T00:00:00Z")) },
    config: {
      rateLimitBypass: {
        enabled: true,
        headerName: "x-stack-test",
        headerValue: "1",
      },
      DEPLOY_ENVIRONMENT: "test",
      unhandledErrorPolicy: "rethrow",
    },
    attributionStore: mockAttributionStore,
  })),
}));

vi.mock("@/shared/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/config")>();
  return {
    ...actual,
    getNodeId: vi.fn(() => TEST_NODE_ID),
    getNodeTokenomicsConfig: vi.fn(() => ({
      tokenAddress: TEST_TOKEN,
      distributorAddress: TEST_DISTRIBUTOR,
      chainId: 8453,
      distributionsActive: true,
    })),
  };
});

// Always allow in contract tests (no real IP rate limiting).
vi.mock("@/bootstrap/http/rateLimiter", () => ({
  publicApiLimiter: { consume: vi.fn(() => true) },
  extractClientIp: vi.fn(() => "test-ip"),
  TokenBucketRateLimiter: vi.fn(),
}));

// Import after mocks.
import { GET } from "@/app/api/v1/public/attribution/tokenomics/route";

function makeEpoch(id: bigint, status: string) {
  return {
    id,
    nodeId: TEST_NODE_ID,
    scopeId: "default",
    status,
    periodStart: new Date("2025-01-01T00:00:00Z"),
    periodEnd: new Date("2025-01-08T00:00:00Z"),
    weightConfig: {},
    poolTotalCredits: null,
    approverSetHash: null,
    approvers: null,
    allocationAlgoRef: null,
    weightConfigHash: null,
    artifactsHash: null,
    openedAt: new Date("2025-01-01T00:00:00Z"),
    closedAt: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
  };
}

describe("GET /api/v1/public/attribution/tokenomics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the repo-spec tokenomics identity + finalized-epoch count", async () => {
    // Two finalized, one open, one collecting — only finalized are counted.
    mockAttributionStore.listEpochs.mockResolvedValue([
      makeEpoch(1n, "finalized"),
      makeEpoch(2n, "open"),
      makeEpoch(3n, "finalized"),
      makeEpoch(4n, "collecting"),
    ]);

    const req = new NextRequest(
      "http://localhost:3000/api/v1/public/attribution/tokenomics"
    );

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // CONFIG_NOT_MANIFEST: token/distributor/chain come from repo-spec config.
    expect(body.tokenAddress).toBe(TEST_TOKEN);
    expect(body.distributorAddress).toBe(TEST_DISTRIBUTOR);
    expect(body.chainId).toBe(8453);
    // story.5003: activation status rides the public config — the Ownership
    // page's ground truth for the not-activated state.
    expect(body.distributionsActive).toBe(true);
    // PUBLIC_READS_FINALIZED_ONLY: only the two finalized epochs count.
    expect(body.epochsCompleted).toBe(2);
  });

  it("renders with zero completed epochs (MANIFEST_INDEPENDENT)", async () => {
    mockAttributionStore.listEpochs.mockResolvedValue([makeEpoch(1n, "open")]);

    const req = new NextRequest(
      "http://localhost:3000/api/v1/public/attribution/tokenomics"
    );

    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tokenAddress).toBe(TEST_TOKEN);
    expect(body.epochsCompleted).toBe(0);
  });
});
