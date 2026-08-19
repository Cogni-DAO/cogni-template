// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/app/api/internal/webhook-route`
 * Purpose: Pin the webhook verification boundary and retryable fresh-node routing behavior.
 * Scope: Route shell with container, routing, persistence, delivery, and dispatch mocked; no IO.
 * Invariants: WEBHOOK_VERIFY_BEFORE_ROUTE, UNIQUE_ROUTE_OR_NO_WRITE, RETRY_UNREADY_ROUTE.
 * Side-effects: none
 * Links: src/app/api/internal/webhooks/[source]/route.ts, bug.5052
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const fakes = vi.hoisted(() => ({
  verify: vi.fn(),
  normalize: vi.fn(),
  catalogLookup: vi.fn(),
  insert: vi.fn(),
  deliver: vi.fn(),
  review: vi.fn(),
  preview: vi.fn(),
  sync: vi.fn(),
  signal: vi.fn(),
}));

const logger = vi.hoisted(() => {
  const instance = {
    child: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  instance.child.mockReturnValue(instance);
  return instance;
});

vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({
    attributionStore: { insertIngestionReceipts: fakes.insert },
    webhookRegistrations: new Map([
      [
        "github",
        {
          source: "github",
          version: "test.v1",
          webhook: {
            supportedEvents: ["issues"],
            verify: fakes.verify,
            normalize: fakes.normalize,
          },
        },
      ],
    ]),
    receiptDelivery: { deliverReceipts: fakes.deliver },
  }),
  resolveAttributionProfileResolver: () => ({
    resolveRepoRoute: fakes.catalogLookup,
  }),
}));
vi.mock("@/app/_facades/review/dispatch.server", () => ({
  dispatchPrReview: fakes.review,
}));
vi.mock("@/app/_facades/deploy/node-preview-promote.server", () => ({
  dispatchNodePreviewPromote: fakes.preview,
}));
vi.mock("@/app/_facades/deploy/canonical-fork-sync.server", () => ({
  dispatchCanonicalForkSync: fakes.sync,
}));
vi.mock("@/features/governance/services/signal-dispatch", () => ({
  dispatchSignalExecution: fakes.signal,
}));
vi.mock("@/shared/config", () => ({
  getNodeId: () => "operator-node",
  getNodeName: () => "operator",
}));
vi.mock("@/shared/env", () => ({
  serverEnv: () => ({ GH_WEBHOOK_SECRET: "webhook-secret" }),
}));
vi.mock("@/shared/observability", () => ({ makeLogger: () => logger }));

import { POST } from "@/app/api/internal/webhooks/[source]/route";

function githubRequest(payload: unknown, eventType: string): Request {
  return new Request("https://test.local/api/internal/webhooks/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": eventType,
      "x-hub-signature-256": "sha256=invalid",
    },
    body: JSON.stringify(payload),
  });
}

async function post(
  payload: unknown,
  eventType = "pull_request"
): Promise<Response> {
  return POST(githubRequest(payload, eventType), {
    params: Promise.resolve({ source: "github" }),
  });
}

describe("POST internal webhook verification boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logger.child.mockReturnValue(logger);
  });

  it("rejects an invalid signature before malformed routing input can cause any side effect", async () => {
    fakes.verify.mockResolvedValue(false);

    const response = await post({
      repository: { full_name: { malformed: true } },
    });

    expect(response.status).toBe(401);
    expect(fakes.verify).toHaveBeenCalledOnce();
    expect(fakes.catalogLookup).not.toHaveBeenCalled();
    expect(fakes.normalize).not.toHaveBeenCalled();
    expect(fakes.insert).not.toHaveBeenCalled();
    expect(fakes.deliver).not.toHaveBeenCalled();
    expect(fakes.review).not.toHaveBeenCalled();
    expect(fakes.preview).not.toHaveBeenCalled();
    expect(fakes.sync).not.toHaveBeenCalled();
    expect(fakes.signal).not.toHaveBeenCalled();
  });

  it("asks GitHub to retry a verified attributable event while a fresh route is unclaimed", async () => {
    fakes.verify.mockResolvedValue(true);
    fakes.catalogLookup.mockResolvedValue({
      status: "unclaimed",
      repo: "cogni-test-org/fresh-node",
    });
    fakes.normalize.mockResolvedValue([
      {
        id: "github:issue:cogni-test-org/fresh-node:1:opened",
        source: "github",
        eventType: "issue_opened",
        platformUserId: "123",
        platformLogin: "contributor",
        artifactUrl: "https://github.com/cogni-test-org/fresh-node/issues/1",
        metadata: null,
        payloadHash: "a".repeat(64),
        eventTime: new Date("2026-08-18T00:00:00.000Z"),
      },
    ]);

    const response = await post(
      { repository: { full_name: "cogni-test-org/fresh-node" } },
      "issues"
    );

    expect(response.status).toBe(503);
    expect(fakes.catalogLookup).toHaveBeenCalledWith(
      "cogni-test-org/fresh-node"
    );
    expect(fakes.insert).not.toHaveBeenCalled();
    expect(fakes.deliver).not.toHaveBeenCalled();
  });
});
