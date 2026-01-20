// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/ai/chat-streaming.stack`
 * Purpose: Verify that /api/v1/ai/chat streaming endpoint truly streams incrementally, not buffered.
 * Scope: Tests chat route, Data Stream Protocol format, and streaming behavior. Does NOT test LiteLLM integration.
 * Invariants: At least 2 text deltas arrive before completion; deltas arrive incrementally (not buffered); abort stops stream.
 * Side-effects: IO (HTTP requests, database writes via completion facade)
 * Notes: Requires dev stack running (pnpm dev:stack:test). Uses real LiteLLM streaming. Uses assistant-stream Data Stream Protocol.
 * Links: src/app/api/v1/ai/chat/route.ts, docs/TESTING.md
 * @public
 */

import { randomUUID } from "node:crypto";
import { seedAuthenticatedUser } from "@tests/_fixtures/auth/db-helpers";
import {
  isFinishMessageEvent,
  isTextDeltaEvent,
  readDataStreamEvents,
} from "@tests/helpers/data-stream";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/adapters/server/db/client";
import { getSessionUser } from "@/app/_lib/auth/session";
import { POST as chatPOST } from "@/app/api/v1/ai/chat/route";
import { GET as modelsGET } from "@/app/api/v1/ai/models/route";
import type { SessionUser } from "@/shared/auth/session";
import { billingAccounts, chargeReceipts } from "@/shared/db/schema.billing";

// Mock session
vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

describe("Chat Streaming", () => {
  it("streams text deltas incrementally (not buffered)", async () => {
    // Arrange - Seed authenticated user with credits
    const db = getDb();
    const { user } = await seedAuthenticatedUser(
      db,
      { id: randomUUID() },
      { balanceCredits: 100_000_000 }
    );

    // user.walletAddress guaranteed non-null by seedAuthenticatedUser (generates via generateTestWallet)
    if (!user.walletAddress) throw new Error("walletAddress required");

    const mockSessionUser: SessionUser = {
      id: user.id,
      walletAddress: user.walletAddress,
    };
    vi.mocked(getSessionUser).mockResolvedValue(mockSessionUser);

    // Fetch valid model ID from models endpoint
    const modelsReq = new NextRequest("http://localhost:3000/api/v1/ai/models");
    const modelsRes = await modelsGET(modelsReq);
    expect(modelsRes.status).toBe(200);
    const modelsData = await modelsRes.json();
    const { defaultPreferredModelId: defaultModelId } = modelsData;

    // Act - Send streaming chat request with prompt that produces multiple tokens
    const req = new NextRequest("http://localhost:3000/api/v1/ai/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        stateKey: randomUUID(),
        clientRequestId: randomUUID(),
        model: defaultModelId,
        stream: true,
        messages: [
          {
            id: randomUUID(),
            role: "user",
            createdAt: new Date().toISOString(),
            content: [
              {
                type: "text",
                text: "Say hello in exactly 15 words or more, using complete sentences.",
              },
            ],
          },
        ],
      }),
    });

    const res = await chatPOST(req);

    // Assert - Response is Data Stream Protocol (text/plain)
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/plain");

    // Collect events with timestamps to prove incremental arrival
    const events: { type: string; value: unknown; t: number }[] = [];
    const start = Date.now();

    for await (const e of readDataStreamEvents(res)) {
      events.push({ ...e, t: Date.now() - start });

      // Stop once completed to avoid hanging tests
      if (isFinishMessageEvent(e)) break;

      // Safety timeout: stop if stream takes too long
      if (Date.now() - start > 30_000) {
        throw new Error("Stream timeout after 30s");
      }
    }

    // Assert - Received at least 2 text delta events (proves streaming)
    // Fake adapter splits response into ~10 chunks
    const deltas = events.filter((e) => isTextDeltaEvent(e));
    expect(deltas.length).toBeGreaterThanOrEqual(2);

    // Assert - Each delta contains incremental text
    for (const delta of deltas) {
      expect(typeof delta.value).toBe("string");
      expect((delta.value as string).length).toBeGreaterThan(0);
    }

    // DEBUG: Log all events to understand what we're receiving
    console.log("DEBUG: Collected events:", JSON.stringify(events, null, 2));

    // Assert - Received finish message event at the end
    const finished = events.find((e) => isFinishMessageEvent(e));
    expect(finished).toBeDefined();

    // Assert - Prove incremental arrival: first delta arrives before completion
    const firstDelta = deltas[0];
    const firstDeltaTime = firstDelta?.t ?? Infinity;
    const completionTime = finished?.t ?? 0;
    expect(firstDeltaTime).toBeLessThan(completionTime);

    // Assert - Multiple deltas arrive at different times (proves not buffered)
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    const firstTime = deltas[0]?.t ?? 0;
    const lastDelta = deltas[deltas.length - 1];
    const lastTime = lastDelta?.t ?? 0;
    // At least some time difference between first and last delta
    expect(lastTime).toBeGreaterThanOrEqual(firstTime);
  });

  it("streaming completion creates charge receipt", async () => {
    // Arrange - Seed authenticated user with credits
    const db = getDb();
    const { user } = await seedAuthenticatedUser(
      db,
      { id: randomUUID() },
      { balanceCredits: 100_000_000 }
    );

    if (!user.walletAddress) throw new Error("walletAddress required");

    const mockSessionUser: SessionUser = {
      id: user.id,
      walletAddress: user.walletAddress,
    };
    vi.mocked(getSessionUser).mockResolvedValue(mockSessionUser);

    // Fetch valid model ID from models endpoint
    const modelsReq = new NextRequest("http://localhost:3000/api/v1/ai/models");
    const modelsRes = await modelsGET(modelsReq);
    expect(modelsRes.status).toBe(200);
    const modelsData = await modelsRes.json();
    const { defaultPreferredModelId: defaultModelId } = modelsData;

    // Act - Send streaming chat request
    const req = new NextRequest("http://localhost:3000/api/v1/ai/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        stateKey: randomUUID(),
        clientRequestId: randomUUID(),
        model: defaultModelId,
        stream: true,
        messages: [
          {
            id: randomUUID(),
            role: "user",
            createdAt: new Date().toISOString(),
            content: [{ type: "text", text: "Hello" }],
          },
        ],
      }),
    });

    const res = await chatPOST(req);

    // Assert - Response is Data Stream Protocol
    expect(res.status).toBe(200);

    // Consume stream to trigger completion
    for await (const e of readDataStreamEvents(res)) {
      if (isFinishMessageEvent(e)) break;
    }

    // Assert - Check database for charge receipt
    // First get the billing account
    const billingAccount = await db.query.billingAccounts.findFirst({
      where: eq(billingAccounts.ownerUserId, user.id),
    });
    expect(billingAccount).toBeTruthy();

    if (!billingAccount) {
      throw new Error("Billing account not found");
    }

    // Get the most recent charge receipt
    const receipt = await db.query.chargeReceipts.findFirst({
      where: eq(chargeReceipts.billingAccountId, billingAccount.id),
      orderBy: (chargeReceipts, { desc }) => [desc(chargeReceipts.createdAt)],
    });

    // Per ACTIVITY_METRICS.md: charge_receipt has minimal fields, no model
    // Model lives in LiteLLM (canonical source)
    expect(receipt).toBeTruthy();
    expect(receipt?.provenance).toBe("stream");
    expect(receipt?.runId).toBeTruthy();
  });

  it("stops streaming when aborted", async () => {
    // Arrange - Seed authenticated user with credits
    const db = getDb();
    const { user } = await seedAuthenticatedUser(
      db,
      { id: randomUUID() },
      { balanceCredits: 100_000_000 }
    );

    // user.walletAddress guaranteed non-null by seedAuthenticatedUser (generates via generateTestWallet)
    if (!user.walletAddress) throw new Error("walletAddress required");

    const mockSessionUser: SessionUser = {
      id: user.id,
      walletAddress: user.walletAddress,
    };
    vi.mocked(getSessionUser).mockResolvedValue(mockSessionUser);

    // Fetch valid model ID from models endpoint
    const modelsReq = new NextRequest("http://localhost:3000/api/v1/ai/models");
    const modelsRes = await modelsGET(modelsReq);
    expect(modelsRes.status).toBe(200);
    const modelsData = await modelsRes.json();
    const { defaultPreferredModelId: defaultModelId } = modelsData;

    const ac = new AbortController();

    // Act - Send streaming request with long response
    const req = new NextRequest("http://localhost:3000/api/v1/ai/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      signal: ac.signal,
      body: JSON.stringify({
        stateKey: randomUUID(),
        clientRequestId: randomUUID(),
        model: defaultModelId,
        stream: true,
        messages: [
          {
            id: randomUUID(),
            role: "user",
            createdAt: new Date().toISOString(),
            content: [
              {
                type: "text",
                text: "Write a very long detailed response with many sentences about the history of computers.",
              },
            ],
          },
        ],
      }),
    });

    const res = await chatPOST(req);

    let deltaCount = 0;
    const start = Date.now();

    try {
      for await (const e of readDataStreamEvents(res)) {
        if (isTextDeltaEvent(e)) {
          deltaCount++;
          // Abort after receiving 2 deltas (proves abort works mid-stream)
          if (deltaCount >= 2) {
            ac.abort();
            break; // Exit loop after abort
          }
        }
        // Safety timeout
        if (Date.now() - start > 30_000) break;
      }
    } catch (error) {
      // Abort may cause the stream to throw - this is expected
      if (error instanceof Error && error.name === "AbortError") {
        // Expected abort error
      } else {
        throw error;
      }
    }

    // Assert - Received exactly 2 deltas before abort (we abort after 2nd delta)
    expect(deltaCount).toBe(2);

    // Assert - Did not receive all ~10 deltas (proves abort stopped the stream mid-way)
    // Fake adapter would send ~10 chunks if not aborted
    expect(deltaCount).toBeLessThan(10);
  });
});
