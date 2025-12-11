// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/config/repoSpec.server`
 * Purpose: Server-only accessor for governance-managed inbound payment configuration for USDC credits top-up, stored in .cogni/repo-spec.yaml.
 * Scope: Reads and caches repo-spec on first access; validates chain alignment and receiver address shape before exposing config to callers; does not run in client bundles or accept env overrides. This is the canonical source for chainId + receiving_address used by OnChainVerifier and payment flows.
 * Invariants: Chain ID must match `@shared/web3` CHAIN_ID; receiving address must look like an EVM address (0x + 40 hex chars); provider must be present.
 * Side-effects: IO (reads repo-spec from disk) on first call only.
 * Links: .cogni/repo-spec.yaml, docs/PAYMENTS_DESIGN.md
 * @public
 */

import fs from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { CHAIN_ID } from "@/shared/web3/chain";

interface RepoSpec {
  cogni_dao?: { chain_id?: unknown };
  payments_in?: {
    credits_topup?: {
      provider?: unknown;
      receiving_address?: unknown;
    };
  };
}

export interface InboundPaymentConfig {
  chainId: number;
  receivingAddress: string;
  provider: string;
}

let cachedPaymentConfig: InboundPaymentConfig | null = null;

function isValidEvmAddress(address: string | undefined): address is string {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

function loadRepoSpec(): RepoSpec {
  const repoSpecPath = path.join(process.cwd(), ".cogni", "repo-spec.yaml");

  if (!fs.existsSync(repoSpecPath)) {
    throw new Error(
      `[repo-spec] Missing configuration at ${repoSpecPath}; DAO wallet and chain settings must be committed`
    );
  }

  const content = fs.readFileSync(repoSpecPath, "utf8");

  try {
    return parse(content) as RepoSpec;
  } catch {
    throw new Error(
      "[repo-spec] Failed to parse .cogni/repo-spec.yaml; ensure valid YAML"
    );
  }
}

function validateAndMap(spec: RepoSpec): InboundPaymentConfig {
  const chainId = Number(spec?.cogni_dao?.chain_id);

  if (!Number.isFinite(chainId)) {
    throw new Error(
      "[repo-spec] Invalid cogni_dao.chain_id; expected numeric chain ID"
    );
  }

  if (chainId !== CHAIN_ID) {
    throw new Error(
      `[repo-spec] Chain mismatch: repo-spec declares ${chainId}, app requires ${CHAIN_ID}`
    );
  }

  const receivingAddress = spec?.payments_in?.credits_topup?.receiving_address;
  if (
    typeof receivingAddress !== "string" ||
    !isValidEvmAddress(receivingAddress.trim())
  ) {
    throw new Error(
      "[repo-spec] Invalid payments_in.credits_topup.receiving_address; expected EVM address (0x + 40 hex chars)"
    );
  }

  const provider = spec?.payments_in?.credits_topup?.provider;
  if (typeof provider !== "string" || provider.trim().length === 0) {
    throw new Error(
      "[repo-spec] Missing payments_in.credits_topup.provider; specify payment provider in repo-spec"
    );
  }

  return {
    chainId,
    receivingAddress: receivingAddress.trim(),
    provider: provider.trim(),
  };
}

export function getPaymentConfig(): InboundPaymentConfig {
  if (cachedPaymentConfig) {
    return cachedPaymentConfig;
  }

  const spec = loadRepoSpec();
  cachedPaymentConfig = validateAndMap(spec);

  return cachedPaymentConfig;
}
