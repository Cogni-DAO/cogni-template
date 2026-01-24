// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/arch/services-layer-boundaries`
 * Purpose: Validates services/ isolation from src/ (Next.js app).
 * Scope: Tests services cannot import src/, src cannot import services/. Does not test packages/ boundaries.
 * Invariants: services/ and src/ are completely isolated; both can import packages/.
 * Side-effects: IO (spawns depcruise subprocess)
 * Notes: Uses arch probes in services/__arch_probes__/.
 * Links: .dependency-cruiser.cjs (no-services-to-src, no-src-to-services rules)
 * @public
 */

import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runDepCruise(probeDirs: string[]): {
  exitCode: number;
  stderr: string;
  stdout: string;
} {
  const includeOnly = probeDirs.map((d) => `^${d}`).join("|");

  const result = spawnSync(
    "pnpm",
    [
      "depcruise",
      ...probeDirs,
      "--config",
      ".dependency-cruiser.cjs",
      "--include-only",
      includeOnly,
      "--output-type",
      "err",
    ],
    {
      encoding: "utf-8",
      cwd: process.cwd(),
    }
  );

  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

describe("Services layer isolation", () => {
  describe("@cogni/scheduler-worker-service", () => {
    it("allows internal imports within service", () => {
      const { exitCode, stderr } = runDepCruise([
        "services/scheduler-worker/src",
      ]);
      if (exitCode !== 0) {
        console.error("STDERR:", stderr);
      }
      expect(exitCode).toBe(0);
    });

    it("blocks importing from src/ (Next.js app)", () => {
      const { exitCode, stdout } = runDepCruise([
        "services/scheduler-worker/__arch_probes__",
        "src/shared",
      ]);
      if (exitCode === 0) {
        console.log("STDOUT:", stdout);
      }
      expect(exitCode).not.toBe(0);
      expect(stdout).toContain("no-services-to-src");
    });
  });
});
