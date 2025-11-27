// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/biome/runBiome`
 * Purpose: Test harness for running Biome against fixture files in isolated temp directories.
 * Scope: Runs Biome CLI against test files in temp dirs. Does NOT touch real repo files.
 * Invariants: All operations in isolated temp dir; returns same shape as runEslint for 1:1 parity.
 * Side-effects: IO (creates/deletes temp directories in OS temp location)
 * Notes: Supports virtualRepoPath for path-sensitive allowlist testing.
 * Links: biome.json, tests/lint/fixtures/
 * @public
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

interface BiomeDiagnostic {
  category: string;
  severity: "error" | "warning" | "info";
  message?: { text?: string };
}

interface BiomeReport {
  diagnostics: BiomeDiagnostic[];
}

const repoRoot = path.resolve(__dirname, "../../..");

interface LintOptions {
  focusRulePrefixes?: string[]; // For compatibility with runEslint
  ignoreRules?: string[];
  virtualRepoPath?: string; // Path where file should appear in temp repo for allowlist matching
}

/**
 * Safety check: Ensure target path is within temp directory
 * @throws Error if path escapes temp dir
 */
function assertSafePath(tempDir: string, targetPath: string): void {
  // Normalize both paths through realpath (handles symlinks like /var vs /private/var)
  const tempDirReal = realpathSync(tempDir);

  // For target, normalize the parent directory if file doesn't exist yet
  const targetDir = path.dirname(targetPath);
  const targetFile = path.basename(targetPath);
  const targetDirReal = realpathSync(targetDir);
  const targetReal = path.join(targetDirReal, targetFile);

  if (!targetReal.startsWith(tempDirReal + path.sep)) {
    throw new Error(
      `SECURITY: Path escape detected! Target ${targetReal} is outside temp dir ${tempDirReal}`
    );
  }
}

/**
 * Validate virtualRepoPath doesn't contain dangerous patterns
 * @throws Error if path is unsafe
 */
function validateVirtualPath(virtualPath: string): void {
  if (path.isAbsolute(virtualPath)) {
    throw new Error(
      `SECURITY: virtualRepoPath must be relative, got: ${virtualPath}`
    );
  }

  if (virtualPath.includes("..")) {
    throw new Error(
      `SECURITY: virtualRepoPath cannot contain '..' , got: ${virtualPath}`
    );
  }

  // Must start with a safe test directory marker OR be inside one
  const hasTestMarker =
    virtualPath.startsWith("__biome_test__/") ||
    virtualPath.includes("/__biome_test__/");

  if (!hasTestMarker) {
    throw new Error(
      `SECURITY: virtualRepoPath must contain '__biome_test__/' to prevent touching real files, got: ${virtualPath}`
    );
  }
}

export async function lintFixture(
  relPath: string,
  code?: string,
  options: LintOptions = {}
): Promise<{
  errors: number;
  warnings: number;
  messages: { ruleId: string | null; message: string; line: number }[];
}> {
  // Validate virtualRepoPath if provided
  if (options.virtualRepoPath) {
    validateVirtualPath(options.virtualRepoPath);
  }

  // Create isolated temp directory
  const tempDir = mkdtempSync(path.join(tmpdir(), "biome-test-"));

  try {
    // Copy biome configs to temp dir
    const filesToCopy = [
      "biome.json",
      "biome/base.json",
      "biome/app.json",
      "biome/tests.json",
      ".gitignore", // Biome needs this for VCS integration
    ];

    for (const file of filesToCopy) {
      const srcPath = path.join(repoRoot, file);
      const destPath = path.join(tempDir, file);

      try {
        mkdirSync(path.dirname(destPath), { recursive: true });
        copyFileSync(srcPath, destPath);
      } catch {
        // File may not exist, that's ok
      }
    }

    // Determine test file path within temp dir
    const testFilePath = options.virtualRepoPath
      ? path.join(tempDir, options.virtualRepoPath)
      : path.join(tempDir, "src", relPath);

    // Create directory structure
    mkdirSync(path.dirname(testFilePath), { recursive: true });

    // Safety check before writing
    assertSafePath(tempDir, testFilePath);

    // Write test content
    if (code) {
      writeFileSync(testFilePath, code, "utf8");
    } else {
      // Copy from fixture
      const fixturePath = path.join(repoRoot, "tests/lint/fixtures", relPath);
      const fixtureContent = readFileSync(fixturePath, "utf8");
      writeFileSync(testFilePath, fixtureContent, "utf8");
    }

    // Run Biome check with cwd=tempDir (isolated from real repo)
    // Use relative path from tempDir so Biome applies config correctly
    // Run biome directly (not through pnpm) since temp dir has no package.json
    const relativeTestPath = path.relative(tempDir, testFilePath);
    const biomeBin = path.join(repoRoot, "node_modules", ".bin", "biome");
    const result = spawnSync(
      biomeBin,
      ["check", "--reporter", "json", relativeTestPath],
      {
        cwd: tempDir,
        encoding: "utf8",
      }
    );

    // Debug: log raw output
    if (process.env.DEBUG_BIOME) {
      console.log("Biome stdout:", result.stdout);
      console.log("Biome stderr:", result.stderr);
      console.log("Biome exit code:", result.status);
    }

    // Parse JSON output
    const jsonLine = (result.stdout ?? "")
      .split("\n")
      .map((line: string) => line.trim())
      .reverse()
      .find((line: string) => line.startsWith("{") && line.endsWith("}"));

    const report: BiomeReport | undefined = jsonLine
      ? JSON.parse(jsonLine)
      : undefined;

    const diagnostics = report?.diagnostics ?? [];

    // Apply focus filtering if specified (for ESLint parity)
    let filtered = diagnostics;
    if (options.focusRulePrefixes && options.focusRulePrefixes.length > 0) {
      filtered = diagnostics.filter((d) =>
        options.focusRulePrefixes?.some((prefix) =>
          d.category.startsWith(prefix)
        )
      );
    }

    // Apply ignore filtering if specified
    if (options.ignoreRules && options.ignoreRules.length > 0) {
      filtered = filtered.filter(
        (d) => !options.ignoreRules?.includes(d.category)
      );
    }

    return {
      errors: filtered.filter((d) => d.severity === "error").length,
      warnings: filtered.filter((d) => d.severity === "warning").length,
      messages: filtered.map((d) => ({
        ruleId: d.category,
        message: d.message?.text ?? "",
        line: 0, // Biome diagnostics don't always expose line in JSON
      })),
    };
  } finally {
    // Clean up entire temp directory (and only temp directory)
    try {
      // Safety check: ensure we're only deleting a temp directory
      if (tempDir.startsWith(tmpdir()) && tempDir.includes("biome-test-")) {
        rmSync(tempDir, { recursive: true, force: true });
      } else {
        console.error(
          `SECURITY: Refusing to delete non-temp directory: ${tempDir}`
        );
      }
    } catch (err) {
      console.error(`Warning: Failed to cleanup temp dir ${tempDir}:`, err);
    }
  }
}
