// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/setup/preflight-binaries`
 * Purpose: Vitest globalSetup that asserts required binaries (rg, git) are in PATH before stack tests run.
 * Scope: Fails fast with actionable install instructions. Does not install anything.
 * Invariants: Must run before any stack test that exercises RipgrepAdapter.
 * Side-effects: none (read-only checks)
 * Links: platform/bootstrap/install/install-ripgrep.sh, docs/COGNI_BRAIN_SPEC.md
 * @internal
 */

import { execFileSync } from "node:child_process";

function assertBinary(name: string, installHint: string): void {
  try {
    execFileSync(name, ["--version"], { stdio: "pipe" });
  } catch {
    throw new Error(
      [
        `❌ Required binary "${name}" not found in PATH.`,
        "",
        "Install it:",
        `  ${installHint}`,
        "",
        "Or run the full bootstrap:",
        "  bash platform/bootstrap/install/install-ripgrep.sh",
      ].join("\n")
    );
  }
}

// biome-ignore lint/style/noDefaultExport: Vitest globalSetup requires default export
export default function preflightBinaries() {
  console.log("\n🔍 Preflight: checking required binaries...");
  assertBinary("rg", "brew install ripgrep      # macOS");
  assertBinary("git", "brew install git          # macOS");
  console.log("✅ rg and git available\n");
}
