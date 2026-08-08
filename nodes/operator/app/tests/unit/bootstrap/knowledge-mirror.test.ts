// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/bootstrap/knowledge-mirror`
 * Purpose: Unit tests for DoltHub mirror remote resolution — derivation is the
 *   default, config is the override, fail-closed on missing owner.
 * Scope: Pure resolver.
 * Side-effects: none
 * Links: src/bootstrap/knowledge-mirror.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

import { resolveNodeKnowledgeRemoteUrl } from "@/bootstrap/knowledge-mirror";

const REPO_SPEC = {
  database: "knowledge_operator",
  remote: {
    provider: "dolthub",
    owner: "cogni-dao",
    repo: "operator",
    url: "https://doltremoteapi.dolthub.com/cogni-dao/operator",
    custody: "cogni-owned",
  },
} as const;

describe("resolveNodeKnowledgeRemoteUrl", () => {
  it("DERIVES <owner>/<slug> by default from slug + owner (no config)", () => {
    expect(
      resolveNodeKnowledgeRemoteUrl({ slug: "operator", owner: "cogni-dao" })
    ).toBe("https://doltremoteapi.dolthub.com/cogni-dao/operator");
  });

  it("derives per-env: a non-prod owner keeps a fresh node off the prod org", () => {
    expect(
      resolveNodeKnowledgeRemoteUrl({
        slug: "beacon",
        owner: "cogni-test-nodes",
      })
    ).toBe("https://doltremoteapi.dolthub.com/cogni-test-nodes/beacon");
  });

  it("FAILS CLOSED: no override, no repo-spec, no owner => undefined (mirror off)", () => {
    expect(
      resolveNodeKnowledgeRemoteUrl({ slug: "operator", owner: undefined })
    ).toBeUndefined();
    expect(
      resolveNodeKnowledgeRemoteUrl({ slug: undefined, owner: "cogni-dao" })
    ).toBeUndefined();
  });

  it("explicit env override wins over derivation AND repo-spec (throwaway isolation)", () => {
    const override =
      "https://doltremoteapi.dolthub.com/cogni-dao/knowledge-operator-candidate-a";
    expect(
      resolveNodeKnowledgeRemoteUrl({
        slug: "operator",
        owner: "cogni-dao",
        override,
        repoSpec: REPO_SPEC,
      })
    ).toBe(override);
  });

  it("repo-spec knowledge.remote.url overrides derivation (custody exception)", () => {
    expect(
      resolveNodeKnowledgeRemoteUrl({
        slug: "operator",
        owner: "cogni-dao",
        repoSpec: REPO_SPEC,
      })
    ).toBe("https://doltremoteapi.dolthub.com/cogni-dao/operator");
  });
});
