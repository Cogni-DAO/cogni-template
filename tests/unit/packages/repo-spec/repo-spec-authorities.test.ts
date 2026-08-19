// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/packages/repo-spec/repo-spec-authorities`
 * Purpose: Validate every checked-in root or node-local repo-spec authority against the current schema.
 * Scope: Read-only filesystem discovery of root and node-local `.cogni/` directories; does not perform network IO.
 * Invariants: REPO_SPEC_AUTHORITY, BUDGET_POLICY_ONLY.
 * Side-effects: IO
 * Links: packages/repo-spec/src/schema.ts, nodes/operator/app/Dockerfile
 * @public
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { parseRepoSpec } from "@cogni/repo-spec";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const authorityPaths = [join(repoRoot, ".cogni", "repo-spec.yaml")];
for (const entry of readdirSync(join(repoRoot, "nodes"), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const candidate = join(
    repoRoot,
    "nodes",
    entry.name,
    ".cogni",
    "repo-spec.yaml"
  );
  if (existsSync(candidate)) authorityPaths.push(candidate);
}

describe("checked-in repo-spec authorities", () => {
  it.each(authorityPaths)("%s uses the sole finite ledger policy", (path) => {
    const yaml = readFileSync(path, "utf8");
    const spec = parseRepoSpec(yaml);
    const legacyPoolKey = ["pool", "config"].join("_");
    const legacyIssuanceKey = ["base", "issuance", "credits"].join("_");

    expect(relative(repoRoot, path)).toBeTruthy();
    expect(spec.activity_ledger?.budget_policy).toBeDefined();
    expect(yaml).not.toContain(`${legacyPoolKey}:`);
    expect(yaml).not.toContain(`${legacyIssuanceKey}:`);
  });
});
