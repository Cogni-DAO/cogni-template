// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/e2e/verify-publish-condition-on-fork`
 * Purpose: Throwaway fork proof for the rebuilt `DistributionPublishCondition`.
 *   Proves, on an anvil Base-fork (no real gas), that the condition (a) answers ERC-165
 *   `supportsInterface(isGranted.selector)` with true, (b) is ACCEPTED by
 *   `DAO.grantWithCondition` — the exact call that reverted on mainnet with
 *   `ConditionInterfaceNotSupported` (0xa6a7dbbd) against the old hand-rolled artifact —
 *   and (c) gates `DAO.execute`: the in-scope publish shape succeeds, an out-of-scope
 *   action reverts.
 * Scope: Verification only; does not touch product code; every write targets the fork.
 * Invariants: FORK_ONLY_WRITES (all txs → 127.0.0.1:8545). Not committed; not a product path.
 * Side-effects: IO (fork txs).
 * Links: packages/cogni-contracts/src/distribution-publish-condition/{abi,bytecode}.ts,
 *   scripts/e2e/complete-distribution-on-fork.ts
 * @internal
 *
 *   pnpm tsx scripts/e2e/verify-publish-condition-on-fork.ts
 *   (fork must be running: `dotenv -e .env.local -- bash scripts/e2e/start-fork.sh`)
 */

import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  type Hex,
  http,
  keccak256,
  parseAbi,
  slice,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
  CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE,
  DISTRIBUTION_PUBLISH_CONDITION_ABI,
  DISTRIBUTION_PUBLISH_CONDITION_BYTECODE,
} from "../../packages/cogni-contracts/src";

const RPC = "http://127.0.0.1:8545"; // FORK_ONLY_WRITES
const ANVIL0: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// toks2 known addresses (Base mainnet). token = real GovernanceERC20 clone whose DAO holds
// mint permission; DAO = the node DAO; owner = the wallet that receives the scoped grant.
const TOKEN = "0x2A6D69Fc6fA5bD7EDe8257979099B65cf1177A8F" as Address;
const DAO = "0x7DeD1C96c6D27427F37F88418B2c3EB2c31eA7A5" as Address;
const OWNER = "0x070075F1389Ae1182aBac722B36CA12285d0c949" as Address;

const EXECUTE_PERMISSION_ID = keccak256(toBytes("EXECUTE_PERMISSION"));
const ISGRANTED_SELECTOR = slice(
  keccak256(toBytes("isGranted(address,address,bytes32,bytes)")),
  0,
  4
); // == type(IPermissionCondition).interfaceId

const DAO_ABI = parseAbi([
  "function grantWithCondition(address _where, address _who, bytes32 _permissionId, address _condition)",
  "function revoke(address _where, address _who, bytes32 _permissionId)",
  "function hasPermission(address _where, address _who, bytes32 _permissionId, bytes _data) view returns (bool)",
  "function execute(bytes32 _callId, (address to, uint256 value, bytes data)[] _actions, uint256 _allowFailureMap) returns (bytes[], uint256)",
]);
const TOKEN_ABI = parseAbi(["function mint(address to, uint256 amount)"]);

const HR = "─".repeat(64);
let pass = true;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) pass = false;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  —  ${detail}` : ""}`
  );
}

async function rpc(method: string, params: unknown[]) {
  return fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((r) => r.json());
}

async function main() {
  const pub = createPublicClient({ chain: base, transport: http(RPC) });
  const chainId = await pub.getChainId();
  console.log(HR);
  console.log(
    `fork chainId = ${chainId} (0x${chainId.toString(16)})  expect 8453 / 0x2105`
  );
  check("fork is Base mainnet (chainId 8453)", chainId === 8453);
  if (chainId !== 8453) throw new Error("not a Base fork — aborting");

  const deployer = privateKeyToAccount(ANVIL0);
  const dw = createWalletClient({
    account: deployer,
    chain: base,
    transport: http(RPC),
  });

  // ── 0. Deploy a real CumulativeMerkleDistributor(token), owner → DAO (so setMerkleRoot works).
  const distDeploy = await dw.deployContract({
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    bytecode: CUMULATIVE_MERKLE_DISTRIBUTOR_BYTECODE as Hex,
    args: [TOKEN],
  });
  const distRcpt = await pub.waitForTransactionReceipt({ hash: distDeploy });
  const distributor = distRcpt.contractAddress as Address;
  await dw.writeContract({
    address: distributor,
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    functionName: "transferOwnership",
    args: [DAO],
  });
  console.log(`distributor deployed → ${distributor} (owner → DAO)`);

  // ── 1. Deploy the rebuilt condition (token, distributor).
  const condDeploy = await dw.deployContract({
    abi: DISTRIBUTION_PUBLISH_CONDITION_ABI,
    bytecode: DISTRIBUTION_PUBLISH_CONDITION_BYTECODE as Hex,
    args: [TOKEN, distributor],
  });
  const condRcpt = await pub.waitForTransactionReceipt({ hash: condDeploy });
  const condition = condRcpt.contractAddress as Address;
  console.log(`condition   deployed → ${condition}`);
  console.log(HR);

  // ── 2. ERC-165 supportsInterface(isGranted.selector) must be true.
  const supports165 = (await pub.readContract({
    address: condition,
    abi: DISTRIBUTION_PUBLISH_CONDITION_ABI,
    functionName: "supportsInterface",
    args: [ISGRANTED_SELECTOR],
  })) as boolean;
  check(
    `supportsInterface(${ISGRANTED_SELECTOR}) == true  [IPermissionCondition]`,
    supports165 === true
  );
  // Sanity: a random interfaceId must be false.
  const supportsRandom = (await pub.readContract({
    address: condition,
    abi: DISTRIBUTION_PUBLISH_CONDITION_ABI,
    functionName: "supportsInterface",
    args: ["0xdeadbeef"],
  })) as boolean;
  check("supportsInterface(0xdeadbeef) == false", supportsRandom === false);

  // ── 3. Impersonate the DAO and call grantWithCondition — MUST NOT revert.
  await rpc("anvil_impersonateAccount", [DAO]);
  await rpc("anvil_setBalance", [DAO, "0x8AC7230489E80000"]);
  const daoWallet = createWalletClient({
    account: DAO,
    chain: base,
    transport: http(RPC),
  });
  // Re-runnable on a reused fork: clear any prior grant (a stale condition binding would make
  // grantWithCondition revert with PermissionAlreadyGrantedForDifferentCondition). No-op on a
  // fresh fork (revoking an ungranted permission is a harmless no-op in OSx).
  try {
    const rh = await daoWallet.writeContract({
      address: DAO,
      abi: DAO_ABI,
      functionName: "revoke",
      args: [DAO, OWNER, EXECUTE_PERMISSION_ID],
    });
    await pub.waitForTransactionReceipt({ hash: rh });
  } catch {
    /* fresh fork — nothing to revoke */
  }
  let grantOk = false;
  let grantErr = "";
  try {
    const h = await daoWallet.writeContract({
      address: DAO,
      abi: DAO_ABI,
      functionName: "grantWithCondition",
      args: [DAO, OWNER, EXECUTE_PERMISSION_ID, condition],
    });
    const r = await pub.waitForTransactionReceipt({ hash: h });
    grantOk = r.status === "success";
    grantErr = `tx ${h.slice(0, 14)}… status=${r.status}`;
  } catch (e) {
    grantErr = (e as Error).message.split("\n")[0];
  }
  check(
    "DAO.grantWithCondition(DAO, owner, EXECUTE, condition) does NOT revert",
    grantOk,
    grantErr
  );

  // hasPermission("0x") — OSx returns false for a conditional grant probed with empty data,
  // so we don't assert it; the real proof is that execute (below) with valid data succeeds.

  // ── 4. Impersonate owner and execute the in-scope publish shape — MUST succeed.
  await rpc("anvil_impersonateAccount", [OWNER]);
  await rpc("anvil_setBalance", [OWNER, "0x8AC7230489E80000"]);
  const ownerWallet = createWalletClient({
    account: OWNER,
    chain: base,
    transport: http(RPC),
  });

  const ROOT = `0x${"11".repeat(32)}` as Hex;
  const mintData = encodeFunctionData({
    abi: TOKEN_ABI,
    functionName: "mint",
    args: [distributor, 10n ** 18n],
  });
  const setRootData = encodeFunctionData({
    abi: CUMULATIVE_MERKLE_DISTRIBUTOR_ABI,
    functionName: "setMerkleRoot",
    args: [ROOT],
  });
  const publishActions = [
    { to: TOKEN, value: 0n, data: mintData },
    { to: distributor, value: 0n, data: setRootData },
  ] as const;

  let execOk = false;
  let execErr = "";
  try {
    const h = await ownerWallet.writeContract({
      address: DAO,
      abi: DAO_ABI,
      functionName: "execute",
      args: [`0x${"00".repeat(32)}` as Hex, publishActions, 0n],
    });
    const r = await pub.waitForTransactionReceipt({ hash: h });
    execOk = r.status === "success";
    execErr = `tx ${h.slice(0, 14)}… status=${r.status}`;
  } catch (e) {
    execErr = (e as Error).message.split("\n")[0];
  }
  check(
    "DAO.execute([mint→distributor, setMerkleRoot]) SUCCEEDS (in scope)",
    execOk,
    execErr
  );

  // Confirm the mint actually landed on the distributor.
  const bal = (await pub.readContract({
    address: TOKEN,
    abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
    functionName: "balanceOf",
    args: [distributor],
  })) as bigint;
  check(
    "distributor received the minted tokens (== 1e18)",
    bal === 10n ** 18n,
    `balance=${bal}`
  );

  // ── 5. NEGATIVE (isolates the CONDITION as the denier): a single mint the DAO CAN itself do
  //   (DAO holds mint permission on the token, proven by check 4), but to the WRONG recipient
  //   (owner, not distributor) — so ONLY the publish-condition can be what rejects it. A revert
  //   here therefore proves the condition denied, not a missing token permission.
  const badMintData = encodeFunctionData({
    abi: TOKEN_ABI,
    functionName: "mint",
    args: [OWNER, 1n], // wrong recipient → out of scope
  });
  const badActions = [{ to: TOKEN, value: 0n, data: badMintData }] as const;
  let denied = false;
  let denyDetail = "";
  try {
    const h = await ownerWallet.writeContract({
      address: DAO,
      abi: DAO_ABI,
      functionName: "execute",
      args: [`0x${"01".repeat(32)}` as Hex, badActions, 0n],
    });
    const r = await pub.waitForTransactionReceipt({ hash: h });
    // If it somehow mined, it must NOT be success.
    denied = r.status !== "success";
    denyDetail = `mined status=${r.status}`;
  } catch (e) {
    denied = true; // reverted at estimate/send — condition denied
    denyDetail = (e as Error).message.split("\n")[0];
  }
  check(
    "DAO.execute([mint→owner]) REVERTS (in-perms but out-of-scope → condition denies)",
    denied,
    denyDetail
  );

  console.log(HR);
  console.log(pass ? "OVERALL: PASS ✅" : "OVERALL: FAIL ❌");
  console.log(`condition address (fork): ${condition}`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error("VERIFY ERRORED:", e);
  process.exit(1);
});
