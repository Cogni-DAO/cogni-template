// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/adapters/server/ingestion/github-receipt-hydrator`
 * Purpose: Prove merged-PR commit hydration is lossless across GitHub REST pages.
 * Scope: Mocked GitHub App client only; no network or database.
 * Invariants: COMMIT_COLLECTION_LOSSLESS.
 * Side-effects: none
 * Links: task.5023
 * @internal
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/adapters/server/review/github-auth", () => ({
  createInstallationOctokit: () => ({ request }),
}));

import { createGitHubMergedPrHydrator } from "@/adapters/server/ingestion/github-receipt-hydrator";

describe("createGitHubMergedPrHydrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns every commit including item 251", async () => {
    const commits = Array.from(
      { length: 251 },
      (_, index) => `commit-${String(index + 1).padStart(3, "0")}`
    );
    request.mockImplementation((_route: string, params: { page: number }) =>
      Promise.resolve({
        data: commits
          .slice((params.page - 1) * 100, params.page * 100)
          .map((sha) => ({ sha })),
      })
    );

    const hydrate = createGitHubMergedPrHydrator({
      appId: "1",
      privateKeyBase64: "unused-by-mock",
    });
    const result = await hydrate({
      installationId: 1,
      owner: "cogni-dao",
      repo: "node",
      prNumber: 42,
    });

    expect(result).toHaveLength(251);
    expect(result[250]).toBe("commit-251");
    expect(request).toHaveBeenCalledTimes(3);
  });
});
