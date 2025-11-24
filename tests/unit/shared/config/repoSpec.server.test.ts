// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/shared/config/repoSpec.server`
 * Purpose: Validate that repo-spec-driven widget config loads correctly and rejects invalid specs.
 * Scope: Pure unit tests against getWidgetConfig(); uses a temporary cwd with fixture repo-spec files; does not assert cache identity or UI wiring.
 * Invariants: repo-spec is the single source for chainId/receivingAddress/provider; invalid specs throw clear errors.
 * Side-effects: none (temp filesystem only)
 * Links: src/shared/config/repoSpec.server.ts, .cogni/repo-spec.yaml
 * @public
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { WidgetConfig } from "@/shared/config";
import { CHAIN_ID } from "@/shared/web3";

interface RepoSpecModule {
  getWidgetConfig: () => WidgetConfig;
}

const ORIGINAL_CWD = process.cwd();

function writeRepoSpec(yaml: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-spec-"));
  const specDir = path.join(tmpDir, ".cogni");
  fs.mkdirSync(specDir);
  fs.writeFileSync(path.join(specDir, "repo-spec.yaml"), yaml);
  return tmpDir;
}

async function loadWidgetConfig(): Promise<RepoSpecModule> {
  vi.resetModules();
  return import("@/shared/config/repoSpec.server");
}

function cleanup(tmpDir: string): void {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe("getWidgetConfig (repo-spec)", () => {
  it("returns mapped widget config for a valid repo-spec", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID}"`,
        "payments_in:",
        "  widget:",
        "    provider: depay",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getWidgetConfig } = await loadWidgetConfig();
      const config = getWidgetConfig();

      expect(config).toEqual({
        chainId: CHAIN_ID,
        receivingAddress: "0x1111111111111111111111111111111111111111",
        provider: "depay",
      });
    } finally {
      cleanup(tmpDir);
    }
  });

  it("throws on missing or non-numeric chain_id", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        "  chain_id: not-a-number",
        "payments_in:",
        "  widget:",
        "    provider: depay",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getWidgetConfig } = await loadWidgetConfig();
      expect(() => getWidgetConfig()).toThrow(/Invalid cogni_dao\.chain_id/i);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("throws when chain_id does not match CHAIN_ID", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID + 1}"`,
        "payments_in:",
        "  widget:",
        "    provider: depay",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getWidgetConfig } = await loadWidgetConfig();
      expect(() => getWidgetConfig()).toThrow(/Chain mismatch/i);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("throws on invalid receiving_address shape", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID}"`,
        "payments_in:",
        "  widget:",
        "    provider: depay",
        "    receiving_address: 0x1234",
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getWidgetConfig } = await loadWidgetConfig();
      expect(() => getWidgetConfig()).toThrow(/receiving_address/i);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("throws when provider is missing or empty", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID}"`,
        "payments_in:",
        "  widget:",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
        "    provider: ''",
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getWidgetConfig } = await loadWidgetConfig();
      expect(() => getWidgetConfig()).toThrow(/provider/i);
    } finally {
      cleanup(tmpDir);
    }
  });
});
