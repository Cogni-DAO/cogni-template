// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/shared/config/repoSpec.server`
 * Purpose: Validate that repo-spec-driven inbound payment config loads correctly and rejects invalid specs.
 * Scope: Pure unit tests against getPaymentConfig(); uses a temporary cwd with fixture repo-spec files; does not assert cache identity or UI wiring.
 * Invariants: repo-spec is the single source for chainId/receivingAddress/provider; invalid specs throw clear errors.
 * Side-effects: none (temp filesystem only)
 * Links: src/shared/config/repoSpec.server.ts, .cogni/repo-spec.yaml
 * @public
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { InboundPaymentConfig } from "@/shared/config";
import { CHAIN_ID } from "@/shared/web3";

interface RepoSpecModule {
  getPaymentConfig: () => InboundPaymentConfig;
}

const ORIGINAL_CWD = process.cwd();

function writeRepoSpec(yaml: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-spec-"));
  const specDir = path.join(tmpDir, ".cogni");
  fs.mkdirSync(specDir);
  fs.writeFileSync(path.join(specDir, "repo-spec.yaml"), yaml);
  return tmpDir;
}

async function loadPaymentConfig(): Promise<RepoSpecModule> {
  vi.resetModules();
  return import("@/shared/config/repoSpec.server");
}

function cleanup(tmpDir: string): void {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe("getPaymentConfig (repo-spec)", () => {
  it("returns mapped inbound payment config for a valid repo-spec", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID}"`,
        "payments_in:",
        "  credits_topup:",
        "    provider: cogni-usdc-backend-v1",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      const config = getPaymentConfig();

      expect(config).toEqual({
        chainId: CHAIN_ID,
        receivingAddress: "0x1111111111111111111111111111111111111111",
        provider: "cogni-usdc-backend-v1",
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
        "  credits_topup:",
        "    provider: cogni-usdc-backend-v1",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      expect(() => getPaymentConfig()).toThrow(/Invalid cogni_dao\.chain_id/i);
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
        "  credits_topup:",
        "    provider: cogni-usdc-backend-v1",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      expect(() => getPaymentConfig()).toThrow(/Chain mismatch/i);
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
        "  credits_topup:",
        "    provider: cogni-usdc-backend-v1",
        "    receiving_address: 0x1234",
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      expect(() => getPaymentConfig()).toThrow(/receiving_address/i);
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
        "  credits_topup:",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
        "    provider: ''",
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      expect(() => getPaymentConfig()).toThrow(/provider/i);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("accepts chain_id as a number (not just string)", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: ${CHAIN_ID}`,
        "payments_in:",
        "  credits_topup:",
        "    provider: cogni-usdc-backend-v1",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      const config = getPaymentConfig();

      expect(config.chainId).toBe(CHAIN_ID);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("throws on invalid EVM address format (schema validation)", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID}"`,
        "payments_in:",
        "  credits_topup:",
        "    provider: test-provider",
        '    receiving_address: "not-an-address"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      expect(() => getPaymentConfig()).toThrow(/repo-spec\.yaml structure/i);
    } finally {
      cleanup(tmpDir);
    }
  });

  it("accepts any string values for allowed_chains (informational metadata)", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID}"`,
        "payments_in:",
        "  credits_topup:",
        "    provider: test-provider",
        '    receiving_address: "0x1111111111111111111111111111111111111111"',
        "    allowed_chains:",
        '      - "CustomChain"',
        '      - "AnotherChain"',
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      const config = getPaymentConfig();
      expect(config.receivingAddress).toBe(
        "0x1111111111111111111111111111111111111111"
      );
    } finally {
      cleanup(tmpDir);
    }
  });

  it("throws when payments_in.credits_topup is missing", async () => {
    const tmpDir = writeRepoSpec(
      [
        "cogni_dao:",
        `  chain_id: "${CHAIN_ID}"`,
        "payments_in:", // missing credits_topup
      ].join("\n")
    );
    process.chdir(tmpDir);

    try {
      const { getPaymentConfig } = await loadPaymentConfig();
      expect(() => getPaymentConfig()).toThrow(/repo-spec\.yaml structure/i);
    } finally {
      cleanup(tmpDir);
    }
  });
});
