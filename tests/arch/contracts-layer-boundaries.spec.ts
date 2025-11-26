// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/arch/contracts-layer-boundaries`
 * Purpose: Validates contracts layer can only import from contracts, shared, and types.
 * Scope: Tests contracts layer boundaries via dependency-cruiser. Does NOT test other layer boundaries.
 * Invariants: Contracts may import from contracts/shared/types; not core/features/ports/adapters/app/components.
 * Side-effects: IO (spawns depcruise subprocess)
 * Notes: Uses arch probes in src/contracts/__arch_probes__/ to test boundary enforcement.
 * Links: .dependency-cruiser.cjs (contracts layer rules), docs/ARCHITECTURE.md
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

describe("Contracts layer boundaries", () => {
  it("allows contracts to import from shared", () => {
    const { exitCode, stderr } = runDepCruise([
      "src/contracts/__arch_probes__",
    ]);
    if (exitCode !== 0) {
      console.error("STDERR:", stderr);
    }
    expect(exitCode).toBe(0);
  });

  it("blocks contracts from importing core", () => {
    const { exitCode, stdout } = runDepCruise([
      "src/contracts/__arch_probes__",
      "src/core/__arch_probes__",
    ]);
    if (exitCode === 0) {
      console.log("STDOUT:", stdout);
    }
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not-in-allowed");
  });

  it("blocks contracts from importing features", () => {
    const { exitCode, stdout } = runDepCruise([
      "src/contracts/__arch_probes__",
      "src/features/__arch_probes__",
    ]);
    if (exitCode === 0) {
      console.log("STDOUT:", stdout);
    }
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not-in-allowed");
  });

  it("blocks contracts from importing ports", () => {
    const { exitCode, stdout } = runDepCruise([
      "src/contracts/__arch_probes__",
      "src/ports/__arch_probes__",
    ]);
    if (exitCode === 0) {
      console.log("STDOUT:", stdout);
    }
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not-in-allowed");
  });

  it("blocks contracts from importing adapters", () => {
    const { exitCode, stdout } = runDepCruise([
      "src/contracts/__arch_probes__",
      "src/adapters/__arch_probes__",
    ]);
    if (exitCode === 0) {
      console.log("STDOUT:", stdout);
    }
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not-in-allowed");
  });

  it("blocks contracts from importing app", () => {
    const { exitCode, stdout } = runDepCruise([
      "src/contracts/__arch_probes__",
      "src/app/__arch_probes__",
    ]);
    if (exitCode === 0) {
      console.log("STDOUT:", stdout);
    }
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not-in-allowed");
  });

  it("blocks contracts from importing components", () => {
    const { exitCode, stdout } = runDepCruise([
      "src/contracts/__arch_probes__",
      "src/components/__arch_probes__",
    ]);
    if (exitCode === 0) {
      console.log("STDOUT:", stdout);
    }
    expect(exitCode).not.toBe(0);
    expect(stdout).toContain("not-in-allowed");
  });
});
