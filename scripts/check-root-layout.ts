// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/check-root-layout`
 * Purpose: Enforces required presence and allowed set of root files/directories replacing repolinter.
 * Scope: Repository root only; does not scan history or non-root paths.
 * Invariants: Required path set must exist; unexpected non-gitignored root entries must be reported.
 * Side-effects: IO (spawns `git check-ignore` for root entries)
 * Notes: Ignores .git, node_modules, macOS metadata, and pnpm store directories.
 * Links: docs/STYLE.md, scripts/validate-doc-headers.ts
 * @internal
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface PathRequirement {
  anyOf: string[];
  kind: "file" | "dir" | "any";
}

const ROOT = process.cwd();

const REQUIRED_PATHS: PathRequirement[] = [
  { anyOf: ["README.md"], kind: "file" },
  { anyOf: ["LICENSE", "LICENSE.md"], kind: "file" },
  { anyOf: [".github/CODEOWNERS", "CODEOWNERS"], kind: "file" },
  { anyOf: [".cogni/repo-spec.yaml"], kind: "file" },
  { anyOf: [".editorconfig"], kind: "file" },
  { anyOf: [".gitignore"], kind: "file" },
  {
    anyOf: [
      ".prettierrc",
      ".prettierrc.cjs",
      ".prettierrc.js",
      ".prettierrc.json",
      ".prettierrc.mjs",
      ".prettierrc.yaml",
      ".prettierrc.yml",
    ],
    kind: "file",
  },
  { anyOf: ["eslint.config.mjs"], kind: "file" },
  { anyOf: ["commitlint.config.cjs"], kind: "file" },
  { anyOf: ["docs"], kind: "dir" },
  { anyOf: ["public"], kind: "dir" },
  { anyOf: ["tests"], kind: "dir" },
  { anyOf: ["e2e"], kind: "dir" },
  { anyOf: ["scripts"], kind: "dir" },
  { anyOf: [".cogni"], kind: "dir" },
  { anyOf: [".allstar"], kind: "dir" },
  { anyOf: ["src/app"], kind: "dir" },
  { anyOf: ["src/features"], kind: "dir" },
  { anyOf: ["src/ports"], kind: "dir" },
  { anyOf: ["src/core"], kind: "dir" },
  { anyOf: ["src/adapters/server"], kind: "dir" },
  { anyOf: ["src/shared"], kind: "dir" },
  { anyOf: ["src/bootstrap"], kind: "dir" },
  { anyOf: ["platform", "infra"], kind: "dir" },
  { anyOf: ["packages"], kind: "dir" },
];

const ALLOWED_ROOT_ENTRIES = new Set<string>([
  ".agent",
  ".allstar",
  ".claude",
  ".clinerules",
  ".cogni",
  ".cursor",
  ".dependency-cruiser.cjs",
  ".dockerignore",
  ".editorconfig",
  ".env.local.example",
  ".env.test.example",
  ".gemini",
  ".github",
  ".gitignore",
  ".husky",
  ".mcp.json",
  ".nvmrc",
  ".obsidian",
  ".prettierignore",
  ".prettierrc",
  ".prettierrc.cjs",
  ".prettierrc.js",
  ".prettierrc.json",
  ".prettierrc.mjs",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  "AGENTS.md",
  "AGENTS_template.md",
  "CLAUDE.md",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "Dockerfile",
  "LICENSE",
  "LICENSE.md",
  "LICENSES",
  "README.md",
  "ROADMAP.md",
  "REUSE.toml",
  "SECURITY.md",
  "biome",
  "biome.json",
  "commitlint.config.cjs",
  "components.json",
  "docs",
  "drizzle.config.ts",
  "e2e",
  "eslint",
  "eslint.config.mjs",
  "infra",
  "knip.json",
  "next.config.ts",
  "package.json",
  "packages",
  "platform",
  "playwright.config.mjs",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "postcss.config.mjs",
  "public",
  "scripts",
  "services",
  "sonar-project.properties",
  "src",
  "tailwind.config.ts",
  "tests",
  "tsconfig.app.json",
  "tsconfig.base.json",
  "tsconfig.eslint.json",
  "tsconfig.json",
  "tsconfig.scripts.json",
  "vitest.api.config.mts",
  "vitest.config.mts",
  "vitest.integration.config.mts",
  "vitest.stack.config.mts",
  "vitest.workspace.ts",
  "work",
]);

const IGNORED_ENTRIES = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
  ".pnpm-store",
]);

function existsAs(pathname: string, kind: PathRequirement["kind"]): boolean {
  const target = path.join(ROOT, pathname);
  if (!fs.existsSync(target)) return false;
  if (kind === "any") return true;
  const stats = fs.statSync(target);
  return kind === "dir" ? stats.isDirectory() : stats.isFile();
}

function isGitIgnored(entry: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", entry], {
    cwd: ROOT,
    stdio: "ignore",
  });

  if (result.error) return false;
  return result.status === 0;
}

function findMissingRequirements(): string[] {
  return REQUIRED_PATHS.flatMap((requirement) => {
    const found = requirement.anyOf.some((candidate) =>
      existsAs(candidate, requirement.kind)
    );
    if (found) return [];

    const label =
      requirement.anyOf.length > 0
        ? requirement.anyOf.join(" | ")
        : "(unspecified requirement)";
    return [label];
  });
}

function findUnexpectedEntries(): string[] {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true });
  const unexpected: string[] = [];

  for (const entry of entries) {
    const name = entry.name;
    if (IGNORED_ENTRIES.has(name)) continue;
    if (isGitIgnored(name)) continue;
    if (!ALLOWED_ROOT_ENTRIES.has(name)) {
      unexpected.push(name);
    }
  }

  return unexpected.sort();
}

function main(): void {
  const missing = findMissingRequirements();
  const unexpected = findUnexpectedEntries();

  if (missing.length === 0 && unexpected.length === 0) {
    console.log("[root-layout] OK: root files and directories match policy.");
    return;
  }

  console.error("[root-layout] FAILED");
  if (missing.length > 0) {
    console.error(" Missing required files or directories:");
    for (const item of missing) {
      console.error(` - ${item}`);
    }
  }

  if (unexpected.length > 0) {
    console.error(" Unexpected root entries (not gitignored):");
    for (const item of unexpected) {
      console.error(` - ${item}`);
    }
  }

  process.exit(1);
}

main();
