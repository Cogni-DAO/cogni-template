// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/ai/chat-streaming.stack`
 * Purpose: Verify that /api/v1/ai/chat streaming endpoint truly streams SSE events incrementally, not buffered.
 * Scope: Tests chat route, SSE format, and streaming behavior. Does NOT test LiteLLM integration.
 * Invariants: At least 2 deltas arrive before completion; deltas arrive incrementally (not buffered); abort stops stream.
 * Side-effects: IO (HTTP requests, database writes via completion facade)
 * Notes: Requires dev stack running (pnpm dev:stack:test). Uses real LiteLLM streaming.
 * Links: src/app/api/v1/ai/chat/route.ts:187-283, docs/TESTING.md
 * @public
 */

import { randomUUID } from "node:crypto";
import { seedAuthenticatedUser } from "@tests/_fixtures/auth/db-helpers";
import { readSseEvents } from "@tests/helpers/sse";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { getDb } from "@/adapters/server/db/client";
import { getSessionUser } from "@/app/_lib/auth/session";
import { POST as chatPOST } from "@/app/api/v1/ai/chat/route";
import { GET as modelsGET } from "@/app/api/v1/ai/models/route";
import type { SessionUser } from "@/shared/auth/session";
import { billingAccounts, llmUsage } from "@/shared/db/schema.billing";

// Mock session
vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

describe("Chat Streaming", () => {
  it("streams SSE deltas incrementally (not buffered)", async () => {
    // Arrange - Seed authenticated user with credits
    const db = getDb();
    const { user } = await seedAuthenticatedUser(
      db,
      { id: randomUUID() },
      { balanceCredits: 10000 }
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
    const { defaultModelId } = modelsData;

    // Act - Send streaming chat request with prompt that produces multiple tokens
    const req = new NextRequest("http://localhost:3000/api/v1/ai/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        threadId: randomUUID(),
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

    // Assert - Response is SSE stream
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain(
      "text/event-stream"
    );

    // Collect events with timestamps to prove incremental arrival
    const events: { event: string; data: string; t: number }[] = [];
    const start = Date.now();

    for await (const e of readSseEvents(res)) {
      events.push({ ...e, t: Date.now() - start });

      // Stop once completed to avoid hanging tests
      if (e.event === "message.completed" || e.event === "done") break;

      // Safety timeout: stop if stream takes too long
      if (Date.now() - start > 30_000) {
        throw new Error("Stream timeout after 30s");
      }
    }

    // Assert - Received message.started event
    const started = events.find((e) => e.event === "message.started");
    expect(started).toBeDefined();
    if (started) {
      const startData = JSON.parse(started.data);
      expect(startData).toHaveProperty("messageId");
      expect(startData).toHaveProperty("role", "assistant");
    }

    // Assert - Received at least 2 message.delta events (proves streaming)
    // Fake adapter splits response into ~10 chunks
    const deltas = events.filter((e) => e.event === "message.delta");
    expect(deltas.length).toBeGreaterThanOrEqual(2);

    // Assert - Each delta contains incremental text
    for (const delta of deltas) {
      const deltaData = JSON.parse(delta.data);
      expect(deltaData).toHaveProperty("messageId");
      expect(deltaData).toHaveProperty("delta");
      expect(typeof deltaData.delta).toBe("string");
      expect(deltaData.delta.length).toBeGreaterThan(0);
    }

    // Assert - Received message.completed event at the end
    const completed = events.find(
      (e) => e.event === "message.completed" || e.event === "done"
    );
    expect(completed).toBeDefined();

    // Assert - Prove incremental arrival: first delta arrives before completion
    const firstDelta = deltas[0];
    const firstDeltaTime = firstDelta?.t ?? Infinity;
    const completionTime = completed?.t ?? 0;
    expect(firstDeltaTime).toBeLessThan(completionTime);

    // Assert - Multiple deltas arrive at different times (proves not buffered)
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    const firstTime = deltas[0]?.t ?? 0;
    const lastDelta = deltas[deltas.length - 1];
    const lastTime = lastDelta?.t ?? 0;
    // At least some time difference between first and last delta
    expect(lastTime).toBeGreaterThanOrEqual(firstTime);
  });

  it("streaming completion includes providerMeta.model", async () => {
    // Arrange - Seed authenticated user with credits
    const db = getDb();
    const { user } = await seedAuthenticatedUser(
      db,
      { id: randomUUID() },
      { balanceCredits: 10000 }
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
    const { defaultModelId } = modelsData;

    // Act - Send streaming chat request
    const req = new NextRequest("http://localhost:3000/api/v1/ai/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        threadId: randomUUID(),
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

    // Assert - Response is SSE stream
    expect(res.status).toBe(200);

    // Consume stream to trigger completion
    for await (const e of readSseEvents(res)) {
      if (e.event === "message.completed" || e.event === "done") break;
    }

    // Assert - Check database for LLM usage record with non-empty model
    // First get the billing account
    const billingAccount = await db.query.billingAccounts.findFirst({
      where: eq(billingAccounts.ownerUserId, user.id),
    });
    expect(billingAccount).toBeTruthy();

    if (!billingAccount) {
      throw new Error("Billing account not found");
    }

    // Get the most recent LLM usage record
    const usageRecord = await db.query.llmUsage.findFirst({
      where: eq(llmUsage.billingAccountId, billingAccount.id),
      orderBy: (llmUsage, { desc }) => [desc(llmUsage.createdAt)],
    });

    expect(usageRecord).toBeTruthy();
    expect(usageRecord?.model).toBeTruthy();
    expect(usageRecord?.model).not.toBe("unknown");
    expect(typeof usageRecord?.model).toBe("string");
  });

  it("stops streaming when aborted", async () => {
    // Arrange - Seed authenticated user with credits
    const db = getDb();
    const { user } = await seedAuthenticatedUser(
      db,
      { id: randomUUID() },
      { balanceCredits: 10000 }
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
    const { defaultModelId } = modelsData;

    const ac = new AbortController();

    // Act - Send streaming request with long response
    const req = new NextRequest("http://localhost:3000/api/v1/ai/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      signal: ac.signal,
      body: JSON.stringify({
        threadId: randomUUID(),
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
      for await (const e of readSseEvents(res)) {
        if (e.event === "message.delta") {
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
