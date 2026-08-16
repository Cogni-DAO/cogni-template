// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/e2e/complete-distribution-on-fork`
 * Purpose: Complete an ALREADY-FINALIZED epoch's distribution on an anvil Base-fork.
 *   Deploys the distributor, DAO-impersonated `mint(delta)` + `setMerkleRoot(root)`, and
 *   claimant-impersonated `claim` — reading the REAL persisted manifest + leaves that a
 *   REAL approver signature produced (unlike finalize-mint-claim.ts, which scripts the
 *   signature itself).
 * Scope: Orchestration only; does not modify product code; all writes target the fork.
 * Invariants:
 *   - FORK_ONLY_WRITES: every on-chain write targets http://127.0.0.1:8545 (guard-0 style).
 *   - MANIFEST_IS_AUTHORITY: root/amounts/leaves come from epoch_distribution_manifests
 *     + epoch_distribution_leaves — never recomputed here.
 *   - CONSERVATION: mint == Σ(claimed); distributor drains to zero.
 * Side-effects: IO (fork txs, DB reads)
 * Links: scripts/e2e/finalize-mint-claim.ts
 * @internal
 *
 *   EPOCH_ID=14 DATABASE_URL=postgresql://… pnpm tsx scripts/e2e/complete-distribution-on-fork.ts
 *   (fork must be running: bash scripts/e2e/start-fork.sh)
 */

import postgres from "postgres";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
  CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE,
} from "../../packages/cogni-contracts/src/cumulative-merkle-distributor";

const RPC = "http://127.0.0.1:8545"; // FORK_ONLY_WRITES
const ANVIL0: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const EPOCH_ID = BigInt(process.env.EPOCH_ID ?? "14");
const DB = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1|@postgres/.test(DB))
  throw new Error("DATABASE_URL must be local (guard)");

async function main() {
  const sql = postgres(DB, { prepare: false });
  const [m] = await sql`
    select merkle_root, token_address, distribution_amount, node_id
    from epoch_distribution_manifests where epoch_id = ${Number(EPOCH_ID)}`;
  const leaves = await sql`
    select account, amount, proof_json from epoch_distribution_leaves
    where epoch_id = ${Number(EPOCH_ID)}`;
  if (!m || leaves.length === 0) throw new Error("manifest/leaves missing");
  const root = m.merkle_root as Hex;
  const token = m.token_address as Address;
  const mintDelta = BigInt(m.distribution_amount);
  console.log(
    `manifest: root=${root} token=${token} mint=${mintDelta} leaves=${leaves.length}`
  );

  const pub = createPublicClient({ chain: base, transport: http(RPC) });
  if ((await pub.getChainId()) !== 8453) throw new Error("fork is not Base");
  const deployer = privateKeyToAccount(ANVIL0);
  const wallet = createWalletClient({
    account: deployer,
    chain: base,
    transport: http(RPC),
  });

  // токs2 governance from the augmented spec's known values (DAO = emissions holder).
  const DAO = "0x7DeD1C96c6D27427F37F88418B2c3EB2c31eA7A5" as Address;

  // 1 — deploy the ONE cumulative distributor (constructor: token), owner → DAO.
  const deployHash = await wallet.deployContract({
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    bytecode: CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE as Hex,
    args: [token],
  });
  const deployRcpt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const distributor = deployRcpt.contractAddress as Address;
  await wallet.writeContract({
    address: distributor,
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    functionName: "transferOwnership",
    args: [DAO],
  });
  console.log(`distributor deployed ${distributor} (owner → DAO)`);

  // 2 — DAO-impersonated mint(delta → distributor) + setMerkleRoot(root).
  const rpc = async (method: string, params: unknown[]) =>
    fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then((r) => r.json());
  await rpc("anvil_impersonateAccount", [DAO]);
  await rpc("anvil_setBalance", [DAO, "0x8AC7230489E80000"]);
  const daoWallet = createWalletClient({
    account: DAO,
    chain: base,
    transport: http(RPC),
  });
  const mintHash = await daoWallet.writeContract({
    address: token,
    abi: parseAbi(["function mint(address to, uint256 amount)"]),
    functionName: "mint",
    args: [distributor, mintDelta],
  });
  await pub.waitForTransactionReceipt({ hash: mintHash });
  const rootHash = await daoWallet.writeContract({
    address: distributor,
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    functionName: "setMerkleRoot",
    args: [root],
  });
  await pub.waitForTransactionReceipt({ hash: rootHash });
  console.log(
    `DAO minted ${mintDelta} → distributor; root set (${mintHash.slice(0, 14)}…, ${rootHash.slice(0, 14)}…)`
  );

  // 3 — each claimant claims (impersonated; product claim path uses the same call).
  const erc20 = parseAbi([
    "function balanceOf(address) view returns (uint256)",
  ]);
  let claimedTotal = 0n;
  for (const leaf of leaves) {
    const account = leaf.account as Address;
    const amount = BigInt(leaf.amount);
    const proof = (
      typeof leaf.proof_json === "string"
        ? JSON.parse(leaf.proof_json || "[]")
        : (leaf.proof_json ?? [])
    ) as Hex[];
    await rpc("anvil_impersonateAccount", [account]);
    await rpc("anvil_setBalance", [account, "0x8AC7230489E80000"]);
    const claimant = createWalletClient({
      account,
      chain: base,
      transport: http(RPC),
    });
    const before = await pub.readContract({
      address: token,
      abi: erc20,
      functionName: "balanceOf",
      args: [account],
    });
    const claimHash = await claimant.writeContract({
      address: distributor,
      abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
      functionName: "claim",
      args: [account, amount, root, proof],
    });
    await pub.waitForTransactionReceipt({ hash: claimHash });
    const after = await pub.readContract({
      address: token,
      abi: erc20,
      functionName: "balanceOf",
      args: [account],
    });
    const got = after - before;
    claimedTotal += got;
    console.log(`claimed ${account}: +${got} (tx ${claimHash.slice(0, 14)}…)`);
    if (got !== amount)
      throw new Error(`claim mismatch: got ${got}, leaf ${amount}`);
  }

  // 4 — conservation.
  const drained = await pub.readContract({
    address: token,
    abi: erc20,
    functionName: "balanceOf",
    args: [distributor],
  });
  if (claimedTotal !== mintDelta)
    throw new Error(
      `conservation broken: claimed ${claimedTotal} != minted ${mintDelta}`
    );
  if (drained !== 0n) throw new Error(`distributor not drained: ${drained}`);
  console.log(
    `\nPASS — epoch ${EPOCH_ID}: minted == claimed == ${mintDelta}; distributor drained; root ${root.slice(0, 16)}…`
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
