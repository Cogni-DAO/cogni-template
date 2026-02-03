// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/test/repo/fake-repo.adapter`
 * Purpose: Fake repo adapter for testing.
 * Scope: Returns deterministic mock results. Does NOT spawn rg or git.
 * Invariants:
 *   - DETERMINISTIC_RESULTS: Always returns same structure for same query
 *   - NO_SUBPROCESS: Never spawns child processes
 * Side-effects: none
 * Links: COGNI_BRAIN_SPEC.md
 * @internal
 */

import type {
  RepoCapability,
  RepoOpenParams,
  RepoOpenResult,
  RepoSearchParams,
  RepoSearchResult,
} from "@cogni/ai-tools";

const FAKE_SHA = "abc1234";

/**
 * Fake repo adapter for testing.
 *
 * Returns deterministic mock results without spawning subprocesses.
 */
export class FakeRepoAdapter implements RepoCapability {
  private searchCallCount = 0;
  private openCallCount = 0;

  async search(params: RepoSearchParams): Promise<RepoSearchResult> {
    this.searchCallCount++;
    const limit = Math.min(params.limit ?? 10, 3);
    const hits = Array.from({ length: limit }, (_, i) => ({
      repoId: "main",
      path: `src/mock-file-${i + 1}.ts`,
      lineStart: 1,
      lineEnd: 10,
      snippet: `// Mock search hit ${i + 1} for "${params.query}"`,
      sha: FAKE_SHA,
    }));
    return { query: params.query, hits };
  }

  async open(params: RepoOpenParams): Promise<RepoOpenResult> {
    this.openCallCount++;
    const lineStart = params.lineStart ?? 1;
    const lineEnd = params.lineEnd ?? lineStart + 19;
    return {
      repoId: "main",
      path: params.path,
      sha: FAKE_SHA,
      lineStart,
      lineEnd,
      content: `// Mock content for ${params.path}\nexport const mock = true;\n`,
    };
  }

  async getSha(): Promise<string> {
    return FAKE_SHA;
  }

  getSearchCallCount(): number {
    return this.searchCallCount;
  }

  getOpenCallCount(): number {
    return this.openCallCount;
  }

  resetCallCounts(): void {
    this.searchCallCount = 0;
    this.openCallCount = 0;
  }
}
