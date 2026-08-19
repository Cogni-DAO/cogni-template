// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ingestion/http-receipt-delivery`
 * Purpose: Pin direct catalog-target delivery and its deterministic idempotency key.
 * Scope: HTTP adapter with mocked fetch; no network or registry/database access.
 * Invariants: NODE_WRITES_OWN_LEDGER, RECEIPT_IDEMPOTENT, CATALOG_TARGET_IS_ROUTING_AUTHORITY.
 * Side-effects: replaces global fetch for each test.
 * Links: src/adapters/server/ingestion/http-receipt-delivery.ts, bug.5052
 * @public
 */

import type { InsertReceiptParams } from "@cogni/attribution-ledger";
import type { Logger } from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createHttpReceiptDelivery,
  type ReceiptDeliveryError,
} from "@/adapters/server/ingestion/http-receipt-delivery";

const receipt: InsertReceiptParams = {
  receiptId: "github:pr:cogni-test-org/fresh-node:42:merged",
  nodeId: "00000000-0000-4000-8000-000000000001",
  source: "github",
  eventType: "pr_merged",
  platformUserId: "123",
  platformLogin: "contributor",
  artifactUrl: "https://github.com/cogni-test-org/fresh-node/pull/42",
  metadata: { repo: "cogni-test-org/fresh-node" },
  payloadHash: "a".repeat(64),
  producer: "github:webhook",
  producerVersion: "test.v1",
  eventTime: new Date("2026-08-18T00:00:00.000Z"),
  retrievedAt: new Date("2026-08-18T00:00:01.000Z"),
};

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createHttpReceiptDelivery", () => {
  it("derives the child service URL from the routed slug and reuses one idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = createHttpReceiptDelivery({
      schedulerApiToken: "scheduler-token",
      logger: silentLogger,
    });
    const target = {
      nodeId: "00000000-0000-4000-8000-000000000001",
      slug: "fresh-node",
    };

    await delivery.deliverReceipts(target, "github", [receipt]);
    await delivery.deliverReceipts(target, "github", [receipt]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(url).toBe(
        "http://fresh-node-node-app:3000/api/internal/attribution/receipts"
      );
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer scheduler-token",
        "Idempotency-Key":
          "00000000-0000-4000-8000-000000000001/github:pr:cogni-test-org/fresh-node:42:merged",
      });
    }
  });

  it("fails loud with retryability when the child rejects delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rolling", { status: 503 }))
    );
    const delivery = createHttpReceiptDelivery({
      schedulerApiToken: "scheduler-token",
      logger: silentLogger,
    });

    const attempt = delivery.deliverReceipts(
      {
        nodeId: "00000000-0000-4000-8000-000000000001",
        slug: "fresh-node",
      },
      "github",
      [receipt]
    );

    await expect(attempt).rejects.toMatchObject<Partial<ReceiptDeliveryError>>({
      name: "ReceiptDeliveryError",
      status: 503,
      retryable: true,
    });
  });
});
