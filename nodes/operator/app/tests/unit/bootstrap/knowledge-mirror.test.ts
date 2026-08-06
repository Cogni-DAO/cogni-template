// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/bootstrap/knowledge-mirror`
 * Purpose: Unit tests for DoltHub mirror runtime wiring (repo-spec + env override).
 * Scope: Pure resolver.
 * Side-effects: none
 * Links: src/bootstrap/knowledge-mirror.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

import { resolveKnowledgeMirrorRemoteUrl } from "@/bootstrap/knowledge-mirror";

describe("resolveKnowledgeMirrorRemoteUrl", () => {
  it("uses the repo-spec knowledge remote URL", () => {
    expect(
      resolveKnowledgeMirrorRemoteUrl({
        database: "knowledge_atlas",
        remote: {
          provider: "dolthub",
          owner: "cogni-test-nodes",
          repo: "knowledge-atlas",
          url: "https://doltremoteapi.dolthub.com/cogni-test-nodes/knowledge-atlas",
          custody: "cogni-owned",
        },
      })
    ).toBe(
      "https://doltremoteapi.dolthub.com/cogni-test-nodes/knowledge-atlas"
    );
  });

  it("disables the mirror when repo-spec has no knowledge remote", () => {
    expect(resolveKnowledgeMirrorRemoteUrl(undefined)).toBeUndefined();
  });

  it("prefers the per-env override over repo-spec (candidate-a → throwaway repo)", () => {
    const override =
      "https://doltremoteapi.dolthub.com/cogni-dao/knowledge-operator-candidate-a";
    expect(
      resolveKnowledgeMirrorRemoteUrl(
        {
          database: "knowledge_operator",
          remote: {
            provider: "dolthub",
            owner: "cogni-dao",
            repo: "operator",
            url: "https://doltremoteapi.dolthub.com/cogni-dao/operator",
            custody: "cogni-owned",
          },
        },
        override
      )
    ).toBe(override);
  });

  it("falls back to repo-spec when the env override is undefined", () => {
    expect(
      resolveKnowledgeMirrorRemoteUrl(
        {
          database: "knowledge_operator",
          remote: {
            provider: "dolthub",
            owner: "cogni-dao",
            repo: "operator",
            url: "https://doltremoteapi.dolthub.com/cogni-dao/operator",
            custody: "cogni-owned",
          },
        },
        undefined
      )
    ).toBe("https://doltremoteapi.dolthub.com/cogni-dao/operator");
  });
});
