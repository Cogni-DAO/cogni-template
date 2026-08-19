// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/features/ingestion/webhook-receiver`
 * Purpose: Verify fail-closed attribution persistence and deterministic replay delivery.
 * Scope: Feature-service orchestration with fake ports; no HTTP, database, or real signature crypto.
 * Invariants: WEBHOOK_VERIFY_BEFORE_NORMALIZE, UNROUTABLE_NEVER_WRITES, RECEIPT_IDEMPOTENT.
 * Side-effects: none
 * Links: src/features/ingestion/services/webhook-receiver.ts, bug.5052
 * @public
 */

import type { AttributionStore } from "@cogni/attribution-ledger";
import type {
  ActivityEvent,
  DataSourceRegistration,
} from "@cogni/ingestion-core";
import type { Logger } from "pino";
import { describe, expect, it, vi } from "vitest";

import { receiveWebhook } from "@/features/ingestion/services/webhook-receiver";
import type { ReceiptDelivery } from "@/ports";

const EVENT: ActivityEvent = {
  id: "github:pr:cogni-test-org/fresh-node:42:merged",
  source: "github",
  eventType: "pr_merged",
  platformUserId: "123",
  platformLogin: "contributor",
  artifactUrl: "https://github.com/cogni-test-org/fresh-node/pull/42",
  metadata: { repo: "cogni-test-org/fresh-node" },
  payloadHash: "a".repeat(64),
  eventTime: new Date("2026-08-18T00:00:00.000Z"),
};

const registration: DataSourceRegistration = {
  source: "github",
  version: "test.v1",
  webhook: {
    supportedEvents: ["pull_request"],
    verify: async () => true,
    normalize: async () => [EVENT],
  },
};

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

function makeDeps(): {
  attributionStore: AttributionStore;
  receiptDelivery: ReceiptDelivery;
  insert: ReturnType<typeof vi.fn>;
  deliver: ReturnType<typeof vi.fn>;
} {
  const insert = vi.fn(async () => undefined);
  const deliver = vi.fn(async () => undefined);
  return {
    attributionStore: {
      insertIngestionReceipts: insert,
    } as unknown as AttributionStore,
    receiptDelivery: { deliverReceipts: deliver },
    insert,
    deliver,
  };
}

const params = {
  source: "github",
  headers: { "x-github-event": "pull_request" },
  body: Buffer.from("{}"),
  secret: "secret",
} as const;

describe("receiveWebhook routing", () => {
  it("normalizes but writes nowhere when attribution has no unique target", async () => {
    const fakes = makeDeps();
    const result = await receiveWebhook(
      {
        attributionStore: fakes.attributionStore,
        sourceRegistrations: new Map([["github", registration]]),
        target: null,
        operatorNodeId: "operator-node",
        receiptDelivery: fakes.receiptDelivery,
        logger: silentLogger,
      },
      params
    );

    expect(result).toMatchObject({
      eventCount: 1,
      persisted: false,
      receipts: [{ receiptId: EVENT.id }],
    });
    expect(fakes.insert).not.toHaveBeenCalled();
    expect(fakes.deliver).not.toHaveBeenCalled();
  });

  it("replays a foreign-node webhook with the same deterministic receipt identity", async () => {
    const fakes = makeDeps();
    const deps = {
      attributionStore: fakes.attributionStore,
      sourceRegistrations: new Map([["github", registration]]),
      target: { nodeId: "fresh-node-id", slug: "fresh-node" },
      operatorNodeId: "operator-node",
      receiptDelivery: fakes.receiptDelivery,
      logger: silentLogger,
    } as const;

    await receiveWebhook(deps, params);
    await receiveWebhook(deps, params);

    expect(fakes.insert).not.toHaveBeenCalled();
    expect(fakes.deliver).toHaveBeenCalledTimes(2);
    const firstReceipts = fakes.deliver.mock.calls[0]?.[2];
    const secondReceipts = fakes.deliver.mock.calls[1]?.[2];
    expect(firstReceipts?.[0]?.receiptId).toBe(EVENT.id);
    expect(secondReceipts?.[0]?.receiptId).toBe(EVENT.id);
  });
});
