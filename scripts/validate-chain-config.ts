// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/validate-chain-config`
 * Purpose: Validate that .cogni/repo-spec.yaml declares the same chain (Base) as the app, and that the configured payment receiver matches the spec.
 * Scope: Build/CI-time guard; reads repo spec and compares chain_id to CHAIN_ID and receiving_address to env var; does not mutate files or perform runtime validation.
 * Invariants: Base mainnet only (chain_id 8453); fails fast if chain ID or receiver address mismatches.
 * Side-effects: IO (reads repo-spec from disk); terminates process on mismatch.
 * Links: .cogni/repo-spec.yaml, src/shared/web3/chain.ts
 * @public
 */

import fs from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { CHAIN_ID } from "@/shared/web3/chain";

function main(): void {
  const repoSpecPath = path.join(process.cwd(), ".cogni", "repo-spec.yaml");
  if (!fs.existsSync(repoSpecPath)) {
    console.error(
      `[chain-config] Missing repo-spec: expected ${repoSpecPath} to exist`
    );
    process.exit(1);
  }

  const content = fs.readFileSync(repoSpecPath, "utf8");
  const spec = parse(content) as {
    cogni_dao?: { chain_id?: unknown };
    payments_in?: {
      widget?: { receiving_address?: string; receiving_address_env?: string };
    };
  };
  const declared = Number(spec?.cogni_dao?.chain_id);

  if (!Number.isFinite(declared)) {
    console.error(
      "[chain-config] Invalid or missing cogni_dao.chain_id in repo-spec; expected Base mainnet (8453)"
    );
    process.exit(1);
  }

  if (declared !== CHAIN_ID) {
    console.error(
      `[chain-config] Chain mismatch: repo-spec declares ${declared}, app is hardcoded to ${CHAIN_ID} (Base mainnet)`
    );
    process.exit(1);
  }

  // Validate receiving address
  const specReceivingAddress =
    spec?.payments_in?.widget?.receiving_address?.toLowerCase();
  const envVarName = spec?.payments_in?.widget?.receiving_address_env;

  if (!specReceivingAddress || !envVarName) {
    console.error(
      "[chain-config] Missing payments_in.widget.receiving_address or receiving_address_env in repo-spec"
    );
    process.exit(1);
  }

  // Load env vars
  const envPath = path.join(process.cwd(), ".env.local");
  let envAddress = process.env[envVarName];

  if (!envAddress && fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const regex = new RegExp(`^${envVarName}="?([^"\\n]+)"?`, "m");
    const match = regex.exec(envContent);
    if (match) {
      envAddress = match[1];
    }
  }

  if (!envAddress) {
    console.error(
      `[chain-config] Missing environment variable ${envVarName} in .env.local or process.env`
    );
    process.exit(1);
  }

  if (envAddress.toLowerCase() !== specReceivingAddress) {
    console.error(
      `[chain-config] Receiver mismatch: repo-spec expects ${specReceivingAddress}, but ${envVarName} is ${envAddress}`
    );
    process.exit(1);
  }

  console.log(
    `[chain-config] OK: repo-spec chain_id ${declared} matches app CHAIN_ID ${CHAIN_ID} (Base mainnet)`
  );
  console.log(
    `[chain-config] OK: repo-spec receiving_address matches ${envVarName}`
  );
}

main();
