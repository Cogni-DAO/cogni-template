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
  buildCanonicalReceiptId,
  buildEventId,
  canonicalJson,
  hashCanonicalPayload,
  hashReceiptEconomicContent,
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

describe("hashReceiptEconomicContent", () => {
  const content = {
    receiptId: "github:pr:github-repo-node-id:42",
    source: "github" as const,
    eventType: "pr_merged" as const,
    platformUserId: "12345",
    artifactUrl: "https://github.com/owner/repo/pull/42",
    metadata: {
      schemaVersion: 1,
      providerRepoId: "github-repo-node-id",
      repo: "owner/repo",
      prNumber: 42,
      baseBranch: "main",
      mergedById: "github-user-node-merger",
      mergeCommitSha: "merge-sha",
      commitShas: ["one", "two"],
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      title: "Ship it",
      labels: ["one", "two"],
    },
    eventTime: new Date("2026-01-15T00:00:00Z"),
  };

  it("covers economic context independent of metadata key order", async () => {
    const reordered = {
      ...content,
      metadata: {
        ...content.metadata,
        commitShas: ["one", "two"],
        providerRepoId: "github-repo-node-id",
        schemaVersion: 1,
      },
    };
    await expect(hashReceiptEconomicContent(content)).resolves.toBe(
      await hashReceiptEconomicContent(reordered)
    );
  });

  it("does not change when mutable presentation changes", async () => {
    const laterSnapshot = {
      ...content,
      platformLogin: "renamed-human",
      artifactUrl: "https://github.com/renamed/repo/pull/42",
      metadata: {
        ...content.metadata,
        repo: "renamed/repo",
        title: "Edited after merge",
        body: "Edited body",
        branch: "renamed-branch",
        labels: ["later-label"],
      },
    };
    await expect(hashReceiptEconomicContent(content)).resolves.toBe(
      await hashReceiptEconomicContent(laterSnapshot)
    );
  });

  it("changes when immutable economic context changes", async () => {
    const conflicting = {
      ...content,
      metadata: { ...content.metadata, additions: 11 },
    };
    await expect(hashReceiptEconomicContent(content)).resolves.not.toBe(
      await hashReceiptEconomicContent(conflicting)
    );
  });

  it("rejects a mutable owner/repo receipt ID", async () => {
    await expect(
      hashReceiptEconomicContent({
        ...content,
        receiptId: "github:pr:owner/repo:42",
      })
    ).rejects.toThrow("does not match canonical event identity");
  });

  it("derives identity from the provider repository object", () => {
    expect(buildCanonicalReceiptId(content)).toBe(
      "github:pr:github-repo-node-id:42"
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
