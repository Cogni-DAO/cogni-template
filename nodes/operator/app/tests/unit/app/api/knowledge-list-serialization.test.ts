// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `knowledge-list-serialization.test`
 * Purpose: Prove GET /api/v1/knowledge — the RECALL_BEFORE_WRITE entry point —
 *   always emits valid, parseable JSON even when a stored entry's content
 *   carries raw control characters, and that a 200 always carries an `items`
 *   array (never null). Guards the exact failure in bug.5062, where an agent's
 *   `jq` over the recall list choked on unescaped control bytes / read null.
 * Scope: Route shell with auth + container mocked; the port is stubbed to inject
 *   raw control chars, so this asserts the SERIALIZER independent of the
 *   write-boundary sanitiser. No DB, no network.
 * Invariants: KNOWLEDGE_LIST_IS_VALID_JSON, LIST_200_ITEMS_IS_ARRAY.
 * Side-effects: none
 * Links: src/app/api/v1/knowledge/route.ts, bug.5062
 */

import { describe, expect, it, vi } from "vitest";

// Build control chars from codes so this source file carries none literally.
const chr = (code: number): string => String.fromCharCode(code);

const port = vi.hoisted(() => ({
  listDomains: vi.fn(),
  listKnowledge: vi.fn(),
}));
const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({ knowledgeStorePort: port }),
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (
      _options: unknown,
      handler: (
        ctx: { log: typeof log },
        request: Request,
        user: { userId: string }
      ) => Promise<Response>
    ) =>
    (request: Request) =>
      handler({ log }, request, { userId: "agent-1" }),
}));

import { GET } from "@/app/api/v1/knowledge/route";

function knowledgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "entry-1",
    domain: "operator",
    entityId: null,
    title: "Two OAuth apps not one per host",
    content: "clean content",
    entryType: "finding",
    confidencePct: 55,
    sourceType: "agent",
    sourceRef: null,
    tags: null,
    evaluateAt: null,
    resolutionStrategy: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

function req(query = "?domain=operator&limit=500"): Request {
  return new Request(`https://test.cognidao.org/api/v1/knowledge${query}`);
}

describe("GET /api/v1/knowledge — serialization safety (bug.5062)", () => {
  it("emits valid, parseable JSON when content carries raw control characters", async () => {
    // A form feed, a bell, a NUL, and a vertical tab embedded mid-string — the
    // bytes jq rejects with 'control characters ... must be escaped'.
    const dirtyContent = `# Heading${chr(0x0a)}${chr(0x0a)}para one${chr(0x0c)}para two${chr(0x07)} bell${chr(0x00)} nul${chr(0x0b)} vt`;
    port.listDomains.mockResolvedValue(["operator"]);
    port.listKnowledge.mockResolvedValue([
      knowledgeRow({ content: dirtyContent }),
    ]);

    const res = await GET(req());
    expect(res.status).toBe(200);

    const text = await res.text();
    // The wire body must parse — this is the assertion that fails if the route
    // ever bypasses JSON.stringify (the reporter's symptom).
    const parsed = JSON.parse(text) as {
      items: Array<{ content: string }>;
      domains: string[];
    };

    // Escaping is lossless: content round-trips byte-for-byte.
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].content).toBe(dirtyContent);

    // And the serialized wire contains NO raw control bytes below 0x20 other
    // than none at all (compact JSON has no structural newlines either).
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      expect(code).toBeGreaterThanOrEqual(0x20);
    }
  });

  it("a 200 always carries an items array, never null, even for an empty domain", async () => {
    port.listDomains.mockResolvedValue(["operator"]);
    port.listKnowledge.mockResolvedValue([]);

    const res = await GET(req("?domain=operator"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: unknown; domains: unknown };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toEqual([]);
    // Regression guard for the 'silently returns items: null' half of bug.5062:
    // on a successful response the field is an array an agent can iterate.
    expect(body.items).not.toBeNull();
  });
});
