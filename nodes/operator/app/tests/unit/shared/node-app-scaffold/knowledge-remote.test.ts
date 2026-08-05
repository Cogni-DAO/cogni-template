// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/shared/node-app-scaffold/knowledge-remote`
 * Purpose: Unit tests for node knowledge mirror naming.
 * Scope: Pure naming helpers.
 * Side-effects: none
 * Links: src/shared/node-app-scaffold/knowledge-remote.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import {
  buildNodeKnowledgeRemote,
  knowledgeDatabaseForSlug,
  knowledgeRemoteWebUrl,
  knowledgeRepoForSlug,
  knowledgeRepoWebUrl,
} from "@/shared/node-app-scaffold/knowledge-remote";

describe("node knowledge remote naming", () => {
  it("normalizes kebab slugs to Doltgres-safe knowledge database names", () => {
    expect(knowledgeDatabaseForSlug("my-node")).toBe("knowledge_my_node");
  });

  it("uses the node slug as the DoltHub repo name", () => {
    expect(knowledgeRepoForSlug("my-node")).toBe("my-node");
  });

  it("derives the human-facing DoltHub repo URL", () => {
    expect(
      knowledgeRepoWebUrl({ owner: "cogni-dao-test", slug: "my-node" })
    ).toBe("https://www.dolthub.com/repositories/cogni-dao-test/my-node");
  });

  it("derives the human-facing DoltHub repo URL from the repo-spec remote identity", () => {
    expect(
      knowledgeRemoteWebUrl({
        database: "knowledge_my_node",
        owner: "cogni-dao-test",
        repo: "my-node",
        url: "https://doltremoteapi.dolthub.com/cogni-dao-test/my-node",
      })
    ).toBe("https://www.dolthub.com/repositories/cogni-dao-test/my-node");
  });

  it("derives the Cogni-owned DoltHub remote URL from the env-scoped owner", () => {
    expect(buildNodeKnowledgeRemote("my-node", "cogni-dao-test")).toEqual({
      database: "knowledge_my_node",
      owner: "cogni-dao-test",
      repo: "my-node",
      url: "https://doltremoteapi.dolthub.com/cogni-dao-test/my-node",
    });
  });
});
