// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/biome/canaries`
 * Purpose: Smoke-test Biome config against core parity gates (easy-rule set).
 * Scope: Formatter + key lint rules (imports, process.env, Tailwind sorting, React hooks, a11y). Does not cover all rules.
 * Invariants: Cleans up temp directories after each test run; respects repoRoot for fixtures.
 * Side-effects: IO (creates temp directories/files under tests/.tmp, repoRoot when baseDir provided).
 * Notes: Uses temporary files to avoid mutating fixtures; cleans up after each test.
 * Links: biome.json
 * @public
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

interface BiomeDiagnostic {
  category: string;
  severity: string;
}

interface BiomeReport {
  diagnostics: BiomeDiagnostic[];
}

const repoRoot = path.resolve(__dirname, "../../..");
const tmpBasePrefix = path.join(repoRoot, "tests/.tmp/biome-");
const cleanupTargets: string[] = [];

mkdirSync(path.dirname(tmpBasePrefix), { recursive: true });

function runBiomeCheck(
  relativePath: string,
  content: string,
  options: { write?: boolean; baseDir?: string; cleanupTarget?: string } = {}
): { report?: BiomeReport } {
  const baseDir =
    options.baseDir ??
    mkdtempSync(path.join(tmpdir(), path.basename(tmpBasePrefix)));

  // Ensure custom bases exist (mkdtemp already creates its directory).
  if (options.baseDir) {
    mkdirSync(baseDir, { recursive: true });
  }

  const targetPath = path.join(baseDir, relativePath);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, "utf8");

  const args = ["biome", "check", "--reporter", "json"];
  if (options.write) args.push("--write");
  args.push(targetPath);

  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  const stdout = (result.stdout ?? "").trim();
  const jsonLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}"));
  const report = jsonLine ? (JSON.parse(jsonLine) as BiomeReport) : undefined;

  const cleanupTarget =
    options.cleanupTarget ?? (options.baseDir ? targetPath : baseDir);
  if (cleanupTarget) {
    cleanupTargets.push(cleanupTarget);
  }

  return report ? { report } : {};
}

afterEach(() => {
  while (cleanupTargets.length > 0) {
    const target = cleanupTargets.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe("Biome canaries", () => {
  it("flags unused imports and prefers type-only imports", () => {
    const baseDir = mkdtempSync(path.join(tmpdir(), "biome-imports-"));
    const fixtureDir = path.join(baseDir, "src/features/biome");
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      path.join(fixtureDir, "types.ts"),
      "export type Widget = { id: string };"
    );

    const { report } = runBiomeCheck(
      "src/features/biome/canary.ts",
      `
import { useEffect } from "react";
import { Widget } from "./types";
export const demo = (): Widget => ({ id: "1" });
      `,
      {
        baseDir,
        cleanupTarget: baseDir,
      }
    );

    const categories = report?.diagnostics.map((d) => d.category) ?? [];
    expect(categories).toContain("lint/correctness/noUnusedImports");
    expect(categories).toContain("lint/style/useImportType");
  });

  it("blocks process.env access outside the allowlist", () => {
    const { report } = runBiomeCheck(
      "src/app/biome-env.ts",
      `export const env = process.env.NODE_ENV ?? "dev";`,
      {
        baseDir: repoRoot,
        cleanupTarget: path.join(repoRoot, "src/app/biome-env.ts"),
      }
    );

    const categories = report?.diagnostics.map((d) => d.category) ?? [];
    expect(categories).toContain("lint/style/noProcessEnv");
  });

  it("allows process.env within env modules", () => {
    const envBase = path.join(repoRoot, "src/shared/env/__biome__");
    const { report } = runBiomeCheck(
      "env.ts",
      `export const env = process.env.NEXT_PUBLIC_SITE_NAME;`,
      {
        baseDir: envBase,
        cleanupTarget: envBase,
      }
    );

    const categories = report?.diagnostics.map((d) => d.category) ?? [];
    expect(categories).not.toContain("lint/style/noProcessEnv");
  });

  it("enforces Tailwind class sorting via useSortedClasses", () => {
    const { report } = runBiomeCheck(
      "src/components/biome/Sorted.tsx",
      `export const Demo = () => <div className="text-center px-4 py-2 flex" />;`
    );

    const categories = report?.diagnostics.map((d) => d.category) ?? [];
    expect(categories).toContain("lint/nursery/useSortedClasses");
  });

  it("flags explicit any (parity with ESLint)", () => {
    const { report } = runBiomeCheck(
      "src/components/biome/Any.tsx",
      `export const explicit = (a: any) => a;`
    );

    const categories = report?.diagnostics.map((d) => d.category) ?? [];
    expect(categories).toContain("lint/suspicious/noExplicitAny");
  });
});
