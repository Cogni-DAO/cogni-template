// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/e2e/local-ui-setup`
 * Purpose: Stand up the distribution e2e so a HUMAN admin can sign in the browser.
 *   Deploys the ONE cumulative distributor on a local anvil Base-fork, transfers
 *   ownership to the DAO, writes an off-tree AUGMENTED repo-spec (distributions active)
 *   for the host ledger worker, and prints what to do next.
 * Scope: Orchestration only; does not run the headless proof (that is
 *   finalize-mint-claim.ts); leaves the fork + spec ready for the app.
 * Invariants: FORK_ONLY_WRITES (all txs → 127.0.0.1:8545); the augmented spec is off-tree.
 * Side-effects: IO (fork txs, writes the off-tree repo-spec).
 * Links: scripts/e2e/finalize-mint-claim.ts, scripts/e2e/README.md
 * @internal
 *
 *   pnpm tsx scripts/e2e/local-ui-setup.ts   (anvil fork must already be running)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import {
  CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
  CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE,
} from "../../packages/cogni-contracts/src/cumulative-merkle-distributor";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const RPC = "http://127.0.0.1:8545";
const SPEC_DIR = path.join(REPO_ROOT, ".harness");

// Proven node-template Base addresses (rig #1920) — throwaway contracts on the
// fork; the real Cogni DAO is NEVER touched.
const DAO = "0x717a747df71111a678202BfCD2E3B0081A9aeB56" as const;
const TOKEN = "0x0166Db3d42603E790Fb685059DcAa37087B032c8" as const;
const HOLDER = "0x070075f1389ae1182abac722b36ca12285d0c949" as const;

const rpc = (method: string, params: unknown[]) =>
  fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((r) => r.json());

async function main() {
  const transport = http(RPC);
  const pub = createPublicClient({ chain: base, transport });
  if ((await pub.getChainId()) !== 8453) {
    throw new Error("anvil Base-fork not on 127.0.0.1:8545 (start it first)");
  }
  await rpc("anvil_setBalance", [HOLDER, "0x56BC75E2D63100000"]);
  await rpc("anvil_impersonateAccount", [HOLDER]);
  await rpc("anvil_setBalance", [DAO, "0x56BC75E2D63100000"]);
  await rpc("anvil_impersonateAccount", [DAO]);
  const holder = createWalletClient({
    account: HOLDER,
    chain: base,
    transport,
  });

  console.log("Deploying CumulativeMerkleDrop(token) on the fork…");
  const deployHash = await holder.deployContract({
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    bytecode: CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE as `0x${string}`,
    args: [TOKEN],
  });
  const distributor = (
    await pub.waitForTransactionReceipt({ hash: deployHash })
  ).contractAddress as `0x${string}`;
  await pub.waitForTransactionReceipt({
    hash: await holder.writeContract({
      address: distributor,
      abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
      functionName: "transferOwnership",
      args: [DAO],
    }),
  });
  console.log(`  distributor: ${distributor} (owner → DAO ${DAO})`);

  // Off-tree augmented repo-spec: distributions active + this distributor. The
  // host ledger worker chdir's here; the tracked .cogni/repo-spec.yaml is untouched.
  const raw = readFileSync(
    path.join(REPO_ROOT, ".cogni", "repo-spec.yaml"),
    "utf8"
  );
  let out = raw.replace(
    /(^governance:[\s\S]*?\n {2}chain_id:.*\n)/m,
    (m) =>
      `${m}  token_contract: "${TOKEN}" # LOCAL-UI fork token\n  emissions_holder: "${DAO}" # LOCAL-UI fork DAO\n`
  );
  out += `\n# LOCAL-UI: activate distributions for the human-sign proof.\ndistributions:\n  status: active\n  distributor_address: "${distributor}"\n`;
  mkdirSync(path.join(SPEC_DIR, ".cogni"), { recursive: true });
  writeFileSync(path.join(SPEC_DIR, ".cogni", "repo-spec.yaml"), out, "utf8");
  console.log(
    `  augmented repo-spec → ${path.join(SPEC_DIR, ".cogni", "repo-spec.yaml")}`
  );

  writeFileSync(
    path.join(SPEC_DIR, "distributor.txt"),
    `${distributor}\n`,
    "utf8"
  );
  console.log(
    "\nSETUP OK. distributor recorded. Next: reset an epoch to review,"
  );
  console.log("pin the admin wallet as approver, start the host worker + app.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
