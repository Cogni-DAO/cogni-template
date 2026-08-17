// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `review-overrides-pinned-auth.test`
 * Purpose: Prove review-phase override writes authorize against the epoch snapshot.
 * Scope: DELETE route shell with store and auth guard mocked.
 * Invariants: APPROVERS_PINNED_AT_REVIEW.
 * Side-effects: none
 * Links: src/app/api/v1/attribution/epochs/[id]/review-subject-overrides/route.ts
 */

import { NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

const epoch = vi.hoisted(() => ({
  id: 7n,
  status: "review" as const,
  approvers: ["0xpinned"],
}));
const store = vi.hoisted(() => ({
  getEpoch: vi.fn(async () => epoch),
  deleteReviewSubjectOverride: vi.fn(),
}));
const checkApprover = vi.hoisted(() =>
  vi.fn(() =>
    NextResponse.json(
      { error: "Not authorized as ledger approver" },
      { status: 403 }
    )
  )
);
const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn() }));

vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({ attributionStore: store }),
}));
vi.mock("@/app/api/v1/attribution/_lib/approver-guard", () => ({
  checkApprover,
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (
      _options: unknown,
      handler: (
        ctx: { log: typeof log; reqId: string },
        request: Request,
        user: { walletAddress: string },
        context: { params: Promise<{ id: string }> }
      ) => Promise<Response>
    ) =>
    (request: Request, context: { params: Promise<{ id: string }> }) =>
      handler(
        { log, reqId: "req-1" },
        request,
        { walletAddress: "0xcurrent-only" },
        context
      ),
}));

import { DELETE } from "@/app/api/v1/attribution/epochs/[id]/review-subject-overrides/route";

describe("review override authorization", () => {
  it("passes the loaded epoch to the approver guard", async () => {
    const response = await DELETE(
      new Request(
        "https://example.test/api/v1/attribution/epochs/7/review-subject-overrides",
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ subjectRef: "receipt-1" }),
        }
      ),
      { params: Promise.resolve({ id: "7" }) }
    );

    expect(response.status).toBe(403);
    expect(checkApprover).toHaveBeenCalledWith(
      expect.anything(),
      "0xcurrent-only",
      epoch
    );
    expect(store.deleteReviewSubjectOverride).not.toHaveBeenCalled();
  });
});
