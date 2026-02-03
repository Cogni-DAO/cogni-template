// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/brain/repo-wiring-smoke`
 * Purpose: End-to-end smoke test for repo capability wiring through the tool layer.
 * Scope: Validates temp git repo → createRepoCapability → tool invocation. Does not test citation guard or DI container.
 * Invariants:
 *   - SHA_STAMPED: tool results include sha7
 *   - Tool layer produces citations in correct format
 * Side-effects: IO (filesystem, rg/git subprocesses)
 * Links: src/bootstrap/capabilities/repo.ts, packages/ai-tools/src/tools/
 * @public
 */

import {
  createRepoOpenImplementation,
  createRepoSearchImplementation,
  REPO_CITATION_REGEX,
} from "@cogni/ai-tools";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RipgrepAdapter } from "@/adapters/server";

import {
  assertBinariesAvailable,
  cleanupTempGitRepo,
  createTempGitRepo,
  KNOWN_FILE,
  type TempGitRepo,
} from "../repo/fixtures/temp-git-repo";

let repo: TempGitRepo;
let searchTool: ReturnType<typeof createRepoSearchImplementation>;
let openTool: ReturnType<typeof createRepoOpenImplementation>;

beforeAll(() => {
  assertBinariesAvailable();
  repo = createTempGitRepo();

  // Wire capability exactly like production bootstrap does
  const adapter = new RipgrepAdapter({ repoRoot: repo.root, repoId: "main" });
  const repoCapability = {
    search: (p: Parameters<typeof adapter.search>[0]) => adapter.search(p),
    open: (p: Parameters<typeof adapter.open>[0]) => adapter.open(p),
    getSha: () => adapter.getSha(),
  };

  searchTool = createRepoSearchImplementation({ repoCapability });
  openTool = createRepoOpenImplementation({ repoCapability });
});

afterAll(() => {
  cleanupTempGitRepo(repo);
});

describe("Repo wiring smoke test", () => {
  it("search and open produce valid results with sha7 and citations", async () => {
    // Search for known content
    const searchResult = await searchTool.execute({ query: "greet" });
    expect(searchResult.hits.length).toBeGreaterThan(0);

    const hit = searchResult.hits[0];
    expect(hit).toBeDefined();
    expect(hit?.sha).toBe(repo.sha7);
    expect(hit?.citation).toMatch(REPO_CITATION_REGEX);

    // Open the known file through tool layer
    const openResult = await openTool.execute({ path: KNOWN_FILE.path });
    expect(openResult.sha).toBe(repo.sha7);
    expect(openResult.content).toContain("export function greet");
    expect(openResult.citation).toMatch(REPO_CITATION_REGEX);
  });
});
