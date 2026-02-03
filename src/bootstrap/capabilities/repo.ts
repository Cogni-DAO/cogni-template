// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/capabilities/repo`
 * Purpose: Factory for RepoCapability - bridges ai-tools capability interface to RipgrepAdapter.
 * Scope: Creates RepoCapability from server environment. Does not implement transport.
 * Invariants:
 *   - NO_SECRETS_IN_CONTEXT: Repo path resolved from env, never passed to tools
 * Side-effects: none (factory only)
 * Links: Called by bootstrap container; consumed by ai-tools repo tools.
 *        Uses env.COGNI_REPO_ROOT (resolved in server.ts).
 * @internal
 */

import type { RepoCapability } from "@cogni/ai-tools";

import { RipgrepAdapter } from "@/adapters/server";
import { FakeRepoAdapter } from "@/adapters/test";
import type { ServerEnv } from "@/shared/env";

/**
 * Stub RepoCapability that throws when not configured.
 */
export const stubRepoCapability: RepoCapability = {
  search: async () => {
    throw new Error(
      "RepoCapability not configured. Set COGNI_REPO_PATH or ensure rg is available."
    );
  },
  open: async () => {
    throw new Error(
      "RepoCapability not configured. Set COGNI_REPO_PATH or ensure rg is available."
    );
  },
  getSha: async () => {
    throw new Error(
      "RepoCapability not configured. Set COGNI_REPO_PATH or ensure rg is available."
    );
  },
};

/**
 * Create RepoCapability from server environment.
 *
 * - APP_ENV=test: FakeRepoAdapter (deterministic, no subprocess)
 * - Otherwise: RipgrepAdapter using env.COGNI_REPO_ROOT (validated in server.ts)
 *
 * @param env - Server environment
 * @returns RepoCapability backed by appropriate adapter
 */
export function createRepoCapability(env: ServerEnv): RepoCapability {
  if (env.isTestMode) {
    const fake = new FakeRepoAdapter();
    return {
      search: (p) => fake.search(p),
      open: (p) => fake.open(p),
      getSha: () => fake.getSha(),
    };
  }

  const adapter = new RipgrepAdapter({
    repoRoot: env.COGNI_REPO_ROOT,
    repoId: "main",
  });
  return {
    search: (p) => adapter.search(p),
    open: (p) => adapter.open(p),
    getSha: () => adapter.getSha(),
  };
}
