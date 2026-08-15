#!/usr/bin/env tsx
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

// TOKS2 RIG — build the OFF-TREE augmented repo-spec for the localhost tokenomics
// e2e (real Base mainnet, toks2 node). Reads the verbatim toks2 spec fetched from
// GitHub (.harness/toks2-repo-spec.orig.yaml), injects
// governance.emissions_holder (= the toks2 DAO), flips distributions.status to
// active, and (when known) records the deployed distributor address from
// .harness/distributor.txt. The tracked .cogni/repo-spec.yaml is
// NEVER touched — app + host ledger worker point at this dir instead.
//
//   pnpm tsx scripts/e2e/toks2-augment-spec.mts            # no distributor yet
//   pnpm tsx scripts/e2e/toks2-augment-spec.mts 0xDIST...  # record distributor

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractChainId,
  extractDaoTokenDistributionConfig,
  extractDistributorAddress,
  extractLedgerApprovers,
  extractNodeId,
  extractScopeId,
  parseRepoSpec,
} from "@cogni/repo-spec";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const SPEC_DIR = path.join(REPO_ROOT, ".harness");

// TOKS2 ground truth (verified on-chain, Base 8453).
const TOKS2 = {
  nodeId: "cf909432-5324-4bff-bb2d-7806f545eeda",
  scopeId: "16bf15cc-16b5-5373-9764-d6b5ea081ce3",
  dao: "0x7ded1c96c6d27427f37f88418b2c3eb2c31ea7a5",
  token: "0x2A6D69Fc6fA5bD7EDe8257979099B65cf1177A8F",
  approver: "0x070075F1389Ae1182aBac722B36CA12285d0c949",
  chainId: 8453,
} as const;

function main() {
  const origPath = path.join(SPEC_DIR, "toks2-repo-spec.orig.yaml");
  if (!existsSync(origPath)) {
    throw new Error(
      `missing ${origPath} — fetch it first:\n  curl -fsS https://raw.githubusercontent.com/cogni-test-org/toks2/main/.cogni/repo-spec.yaml -o ${origPath}`
    );
  }
  const raw = readFileSync(origPath, "utf8");

  // distributor: argv[2] wins, else distributor.txt if present, else absent.
  const distributorArg = process.argv[2]?.trim();
  const distributorFile = path.join(SPEC_DIR, "distributor.txt");
  const distributor =
    distributorArg ??
    (existsSync(distributorFile)
      ? readFileSync(distributorFile, "utf8").trim()
      : "");
  if (distributor && !/^0x[0-9a-fA-F]{40}$/.test(distributor)) {
    throw new Error(`invalid distributor address: ${distributor}`);
  }

  // 1. inject emissions_holder into the governance block (after chain_id).
  let out = raw.replace(
    /(^governance:[\s\S]*?\n {2}chain_id:.*\n)/m,
    (m) =>
      `${m}  emissions_holder: "${TOKS2.dao}" # RIG: toks2 DAO mints + owns the distributor\n`
  );
  // 2. flip distributions to active (+ distributor once deployed).
  const distBlock =
    "distributions:\n" +
    "  status: active # RIG: activated off-tree for the localhost e2e\n" +
    '  claim_contract_pattern: "1inch.cumulative-merkle-drop.v1"\n' +
    (distributor
      ? `  distributor_address: "${distributor}" # RIG: deployed on Base by the owner (moment 1)\n`
      : "");
  out = out.replace(
    /^distributions:\n {2}status: pending_activation\n/m,
    distBlock
  );

  // Validate: parses + all identities match ground truth.
  const spec = parseRepoSpec(out);
  const nodeId = extractNodeId(spec);
  const scopeId = extractScopeId(spec);
  const chainId = extractChainId(spec);
  if (nodeId !== TOKS2.nodeId) throw new Error(`node_id drift: ${nodeId}`);
  if (scopeId !== TOKS2.scopeId) throw new Error(`scope_id drift: ${scopeId}`);
  if (chainId !== TOKS2.chainId) throw new Error(`chain_id drift: ${chainId}`);
  const dist = extractDaoTokenDistributionConfig(spec, TOKS2.chainId);
  if (!dist) throw new Error("distributions not active after augmentation");
  if (dist.tokenAddress.toLowerCase() !== TOKS2.token.toLowerCase()) {
    throw new Error(`token drift: ${dist.tokenAddress}`);
  }
  if (dist.emissionsHolderAddress.toLowerCase() !== TOKS2.dao.toLowerCase()) {
    throw new Error(`emissions_holder drift: ${dist.emissionsHolderAddress}`);
  }
  const approvers = extractLedgerApprovers(spec);
  if (!approvers.includes(TOKS2.approver.toLowerCase())) {
    throw new Error(`approver ${TOKS2.approver} missing from activity_ledger`);
  }

  mkdirSync(path.join(SPEC_DIR, ".cogni"), { recursive: true });
  writeFileSync(path.join(SPEC_DIR, ".cogni", "repo-spec.yaml"), out, "utf8");
  console.log(
    `augmented spec → ${path.join(SPEC_DIR, ".cogni", "repo-spec.yaml")}`
  );
  console.log(`  node ${nodeId} scope ${scopeId} chain ${chainId}`);
  console.log(`  token ${dist.tokenAddress}`);
  console.log(`  emissions_holder ${dist.emissionsHolderAddress}`);
  console.log(
    `  distributor ${extractDistributorAddress(spec) ?? "<NOT RECORDED YET — rerun with the address after moment 1>"}`
  );
}

main();
