// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ingestion-core/tests/helpers`
 * Purpose: Unit tests for deterministic ID construction, canonical JSON, and payload hashing.
 * Scope: Test-only. Does not contain production code.
 * Invariants: Validates ACTIVITY_IDEMPOTENT (deterministic IDs and hashes).
 * Side-effects: none
 * Links: packages/ingestion-core/src/helpers.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

import {
  buildEventId,
  canonicalJson,
  hashCanonicalPayload,
  hashReceiptContent,
} from "../src/helpers";

describe("buildEventId", () => {
  it("builds github PR id", () => {
    expect(buildEventId("github", "pr", "owner/repo", 42)).toBe(
      "github:pr:owner/repo:42"
    );
  });

  it("builds github review id with PR and review IDs", () => {
    expect(buildEventId("github", "review", "owner/repo", 42, 1234567)).toBe(
      "github:review:owner/repo:42:1234567"
    );
  });

  it("builds discord message id", () => {
    expect(
      buildEventId("discord", "message", "guild123", "channel456", "msg789")
    ).toBe("discord:message:guild123:channel456:msg789");
  });

  it("builds github issue id", () => {
    expect(buildEventId("github", "issue", "owner/repo", 99)).toBe(
      "github:issue:owner/repo:99"
    );
  });

  it("is deterministic — same input always produces same output", () => {
    const a = buildEventId("github", "pr", "cogni-dao/cogni-template", 123);
    const b = buildEventId("github", "pr", "cogni-dao/cogni-template", 123);
    expect(a).toBe(b);
  });
});

describe("canonicalJson", () => {
  it("sorts keys alphabetically", () => {
    expect(canonicalJson({ c: 3, a: 1, b: 2 })).toBe('{"a":1,"b":2,"c":3}');
  });

  it("produces identical output regardless of input key order", () => {
    const a = canonicalJson({ z: "last", a: "first", m: "middle" });
    const b = canonicalJson({ a: "first", m: "middle", z: "last" });
    const c = canonicalJson({ m: "middle", z: "last", a: "first" });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("handles string values", () => {
    expect(canonicalJson({ id: "github:pr:owner/repo:42" })).toBe(
      '{"id":"github:pr:owner/repo:42"}'
    );
  });

  it("handles empty object", () => {
    expect(canonicalJson({})).toBe("{}");
  });

  it("recursively sorts nested context while preserving array order", () => {
    expect(canonicalJson({ z: { b: 2, a: 1 }, commits: ["b", "a"] })).toBe(
      '{"commits":["b","a"],"z":{"a":1,"b":2}}'
    );
  });
});

describe("hashReceiptContent", () => {
  const content = {
    receiptId: "github:pr:owner/repo:42",
    source: "github" as const,
    eventType: "pr_merged" as const,
    platformUserId: "12345",
    artifactUrl: "https://github.com/owner/repo/pull/42",
    metadata: {
      schemaVersion: 1,
      repo: "owner/repo",
      title: "Ship it",
      labels: ["one", "two"],
    },
    eventTime: new Date("2026-01-15T00:00:00Z"),
  };

  it("covers nested attribution context independent of object key order", async () => {
    const reordered = {
      ...content,
      metadata: {
        labels: ["one", "two"],
        title: "Ship it",
        repo: "owner/repo",
        schemaVersion: 1,
      },
    };
    await expect(hashReceiptContent(content)).resolves.toBe(
      await hashReceiptContent(reordered)
    );
  });

  it("changes when attribution context changes", async () => {
    const lowerFidelity = {
      ...content,
      metadata: { ...content.metadata, title: "" },
    };
    await expect(hashReceiptContent(content)).resolves.not.toBe(
      await hashReceiptContent(lowerFidelity)
    );
  });
});

describe("hashCanonicalPayload", () => {
  it("produces a 64-character hex string", async () => {
    const hash = await hashCanonicalPayload({ id: "test" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same input produces same hash", async () => {
    const fields = {
      id: "github:pr:owner/repo:42",
      authorId: "12345",
      mergedAt: "2026-01-15T00:00:00Z",
    };
    const a = await hashCanonicalPayload(fields);
    const b = await hashCanonicalPayload(fields);
    expect(a).toBe(b);
  });

  it("is deterministic regardless of key order", async () => {
    const a = await hashCanonicalPayload({
      mergedAt: "2026-01-15T00:00:00Z",
      id: "github:pr:owner/repo:42",
      authorId: "12345",
    });
    const b = await hashCanonicalPayload({
      authorId: "12345",
      id: "github:pr:owner/repo:42",
      mergedAt: "2026-01-15T00:00:00Z",
    });
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await hashCanonicalPayload({ id: "event-1" });
    const b = await hashCanonicalPayload({ id: "event-2" });
    expect(a).not.toBe(b);
  });
});
