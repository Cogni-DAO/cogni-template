// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `attribution-review-route.test`
 * Purpose: Prove the server refuses open→review before periodEnd.
 * Scope: Route shell with auth, store, and hashing mocked; no DB or network.
 * Invariants: REVIEW_ONLY_AFTER_PERIOD_END.
 * Side-effects: none
 * Links: src/app/api/v1/attribution/epochs/[id]/review/route.ts, bug.5042
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  getEpoch: vi.fn(),
  closeIngestion: vi.fn(),
}));
const checkApprover = vi.hoisted(() => vi.fn(() => null));
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));

vi.mock("@cogni/attribution-ledger", () => ({
  computeApproverSetHash: vi.fn(async () => "approver-hash"),
  computeWeightConfigHash: vi.fn(async () => "weight-hash"),
  deriveAllocationAlgoRef: vi.fn(() => "weight-sum-v0"),
  validateWeightConfig: vi.fn(),
}));
vi.mock("@/app/api/v1/attribution/_lib/approver-guard", () => ({
  checkApprover,
}));
vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({ attributionStore: store }),
}));
vi.mock("@/shared/config", () => ({
  getLedgerApprovers: () => ["0xapprover"],
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (
      _options: unknown,
      handler: (
        ctx: { log: typeof log },
        request: Request,
        user: { walletAddress: string },
        context: { params: Promise<{ id: string }> }
      ) => Promise<Response>
    ) =>
    (request: Request, context: { params: Promise<{ id: string }> }) =>
      handler({ log }, request, { walletAddress: "0xapprover" }, context),
}));

import { POST } from "@/app/api/v1/attribution/epochs/[id]/review/route";

function makeEpoch(periodEnd: Date) {
  return {
    id: 7n,
    nodeId: "node-1",
    scopeId: "scope-1",
    status: "open" as const,
    periodStart: new Date("2026-08-10T00:00:00.000Z"),
    periodEnd,
    weightConfig: { "github:pr_merged": 1000 },
    approvers: null,
    poolTotalCredits: null,
    openedAt: new Date("2026-08-10T00:00:00.000Z"),
    closedAt: null,
    createdAt: new Date("2026-08-10T00:00:00.000Z"),
  };
}

async function postReview(): Promise<Response> {
  return POST(
    new Request("https://example.test/api/v1/attribution/epochs/7/review", {
      method: "POST",
    }),
    { params: Promise.resolve({ id: "7" }) }
  );
}

describe("POST epoch review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-17T00:00:00.000Z");
  });
  afterEach(() => vi.useRealTimers());

  it("returns 409 while the contribution period is active", async () => {
    store.getEpoch.mockResolvedValue(
      makeEpoch(new Date("2026-08-17T00:00:00.001Z"))
    );
    const response = await postReview();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "epoch_period_active",
    });
    expect(store.closeIngestion).not.toHaveBeenCalled();
  });

  it("allows the transition at the exact boundary", async () => {
    const epoch = makeEpoch(new Date("2026-08-17T00:00:00.000Z"));
    store.getEpoch.mockResolvedValue(epoch);
    store.closeIngestion.mockResolvedValue({
      ...epoch,
      status: "review",
      approvers: ["0xapprover"],
    });
    const response = await postReview();
    expect(response.status).toBe(200);
    expect(store.closeIngestion).toHaveBeenCalledOnce();
  });
});
