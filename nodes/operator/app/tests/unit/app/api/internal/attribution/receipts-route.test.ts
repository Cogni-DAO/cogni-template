// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/api/internal/attribution/receipts-route`
 * Purpose: Prove strict hash validation and honest insert/duplicate/conflict receiver responses.
 * Scope: Route orchestration with mocked store; no database or network.
 * Invariants: INVALID_HASH_400, DUPLICATE_VISIBLE, CONFLICT_409.
 * Side-effects: none
 * Links: src/app/api/internal/attribution/receipts/route.ts, story.5023
 * @internal
 */

import { ReceiptContentConflictError } from "@cogni/attribution-ledger";
import {
  buildGitHubPrMergedContextV1,
  hashReceiptEconomicContent,
} from "@cogni/ingestion-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const insertIngestionReceipts = vi.fn();
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock("@cogni/node-shared", () => ({
  verifySchedulerBearer: () => true,
}));
vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({ attributionStore: { insertIngestionReceipts } }),
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (
      _meta: unknown,
      handler: (ctx: { log: typeof log }, request: Request) => unknown
    ) =>
    (request: Request) =>
      handler({ log }, request),
}));
vi.mock("@/shared/config", () => ({ getNodeId: () => NODE_ID }));
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({ SCHEDULER_API_TOKEN: "test-token" }),
}));

import { POST } from "@/app/api/internal/attribution/receipts/route";

async function validEnvelope() {
  const metadata = buildGitHubPrMergedContextV1({
    providerRepoId: "github-repo-node-id",
    repo: "cogni-dao/node",
    prNumber: 42,
    title: "Human contribution",
    body: "Full body",
    baseBranch: "main",
    branch: "feat/human",
    mergeCommitSha: "merge-sha",
    mergedById: "github-user-node-merger",
    commitShas: ["commit-sha"],
    labels: [],
    additions: 4,
    deletions: 1,
    changedFiles: 2,
  });
  const receipt = {
    receiptId: "github:pr:cogni-dao/node:42",
    source: "github" as const,
    eventType: "pr_merged" as const,
    platformUserId: "12345",
    platformLogin: "human",
    artifactUrl: "https://github.com/cogni-dao/node/pull/42",
    metadata,
    producer: "github:webhook" as const,
    producerVersion: "0.4.0",
    eventTime: "2026-08-16T20:00:00.000Z",
    retrievedAt: "2026-08-16T20:00:01.000Z",
  };
  return {
    nodeId: NODE_ID,
    source: "github",
    receipts: [
      {
        ...receipt,
        payloadHash: await hashReceiptEconomicContent({
          receiptId: receipt.receiptId,
          source: receipt.source,
          eventType: receipt.eventType,
          platformUserId: receipt.platformUserId,
          artifactUrl: receipt.artifactUrl,
          metadata,
          eventTime: receipt.eventTime,
        }),
      },
    ],
  };
}

async function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://node/api/internal/attribution/receipts", {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );
}

describe("POST internal attribution receipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports an inserted receipt exactly", async () => {
    insertIngestionReceipts.mockResolvedValue({
      inserted: 1,
      duplicates: 0,
      conflicts: 0,
    });
    const response = await post(await validEnvelope());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      received: 1,
      inserted: 1,
      duplicates: 0,
      conflicts: 0,
    });
  });

  it("reports a same-content retry as a duplicate, not an insert", async () => {
    insertIngestionReceipts.mockResolvedValue({
      inserted: 0,
      duplicates: 1,
      conflicts: 0,
    });
    const response = await post(await validEnvelope());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      inserted: 0,
      duplicates: 1,
      conflicts: 0,
    });
  });

  it("returns 409 with conflict IDs when the same ID has different content", async () => {
    insertIngestionReceipts.mockRejectedValue(
      new ReceiptContentConflictError(["github:pr:cogni-dao/node:42"], 0)
    );
    const response = await post(await validEnvelope());
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      inserted: 0,
      duplicates: 0,
      conflicts: 1,
      conflictReceiptIds: ["github:pr:cogni-dao/node:42"],
    });
  });

  it("rejects a forged or stale payload hash before storage", async () => {
    const envelope = await validEnvelope();
    const firstReceipt = envelope.receipts[0];
    if (!firstReceipt) throw new Error("expected receipt fixture");
    firstReceipt.payloadHash = "f".repeat(64);
    const response = await post(envelope);
    expect(response.status).toBe(400);
    expect(insertIngestionReceipts).not.toHaveBeenCalled();
  });
});
