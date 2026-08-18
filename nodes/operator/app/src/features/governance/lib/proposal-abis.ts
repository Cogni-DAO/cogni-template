// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/governance/lib/proposal-abis`
 * Purpose: Contract ABIs for DAO proposal creation (CogniSignal + Aragon TokenVoting).
 * Scope: ABI definitions only — no contract calls, no state.
 * Invariants: ABIs must match deployed contract versions.
 * Side-effects: none
 * Links: cogni-proposal-launcher/src/lib/abis.ts
 * @public
 */

import { encodeFunctionData, keccak256, toBytes } from "viem";

/**
 * Aragon OSx permission id for the DAO's `execute` entrypoint:
 * `keccak256("EXECUTE_PERMISSION")`. A wallet holding this on the DAO (where=DAO,
 * who=wallet) may call `DAO.execute(...)` directly — the standing authority the
 * ONE-TIME authorize grants, so per-epoch publishing needs no vote.
 */
export const EXECUTE_PERMISSION_ID = keccak256(
  toBytes("EXECUTE_PERMISSION")
) as `0x${string}`;

export const COGNI_SIGNAL_ABI = [
  {
    type: "function",
    name: "signal",
    inputs: [
      { name: "vcs", type: "string", internalType: "string" },
      { name: "repoUrl", type: "string", internalType: "string" },
      { name: "action", type: "string", internalType: "string" },
      { name: "target", type: "string", internalType: "string" },
      { name: "resource", type: "string", internalType: "string" },
      { name: "extra", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const TOKEN_VOTING_ABI = [
  {
    type: "function",
    name: "createProposal",
    inputs: [
      { name: "_metadata", type: "bytes", internalType: "bytes" },
      {
        name: "_actions",
        type: "tuple[]",
        internalType: "struct Action[]",
        components: [
          { name: "to", type: "address", internalType: "address" },
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "data", type: "bytes", internalType: "bytes" },
        ],
      },
      {
        name: "_allowFailureMap",
        type: "uint256",
        internalType: "uint256",
      },
      { name: "_startDate", type: "uint64", internalType: "uint64" },
      { name: "_endDate", type: "uint64", internalType: "uint64" },
      {
        name: "_voteOption",
        type: "uint8",
        internalType: "enum IMajorityVoting.VoteOption",
      },
      { name: "_tryEarlyExecution", type: "bool", internalType: "bool" },
    ],
    outputs: [{ name: "proposalId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
] as const;

/**
 * Aragon OSx DAO minimal ABI — the three functions the publish surface needs:
 *   - `hasPermission`  (view) — gate the two-state UI on whether the wallet is authorized.
 *   - `grantWithCondition` (nonpayable) — the ONE-TIME CAS-scoped authorize action.
 *   - `execute`        (nonpayable) — the PER-EPOCH direct publish, callable once the wallet
 *     holds EXECUTE_PERMISSION; runs [mint, setMerkleRoot] atomically as msg.sender=DAO.
 * Source: Aragon OSx v1.3 `DAO.sol` (IDAO). Kept minimal — reads/writes only what publish uses.
 */
export const DAO_ABI = [
  {
    type: "function",
    name: "hasPermission",
    stateMutability: "view",
    inputs: [
      { name: "_where", type: "address", internalType: "address" },
      { name: "_who", type: "address", internalType: "address" },
      { name: "_permissionId", type: "bytes32", internalType: "bytes32" },
      { name: "_data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
  },
  {
    // SCOPED authorize: bind the executor's EXECUTE_PERMISSION to a condition contract so
    // the grant only permits the publish action set. Executes AS the DAO inside the proposal.
    type: "function",
    name: "grantWithCondition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_where", type: "address", internalType: "address" },
      { name: "_who", type: "address", internalType: "address" },
      { name: "_permissionId", type: "bytes32", internalType: "bytes32" },
      {
        name: "_condition",
        type: "address",
        internalType: "contract IPermissionCondition",
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_callId", type: "bytes32", internalType: "bytes32" },
      {
        name: "_actions",
        type: "tuple[]",
        internalType: "struct Action[]",
        components: [
          { name: "to", type: "address", internalType: "address" },
          { name: "value", type: "uint256", internalType: "uint256" },
          { name: "data", type: "bytes", internalType: "bytes" },
        ],
      },
      { name: "_allowFailureMap", type: "uint256", internalType: "uint256" },
    ],
    outputs: [
      { name: "", type: "bytes[]", internalType: "bytes[]" },
      { name: "", type: "uint256", internalType: "uint256" },
    ],
  },
] as const;

const MINT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [],
  },
] as const;
const SET_MERKLE_ROOT_ABI = [
  {
    type: "function",
    name: "setMerkleRoot",
    stateMutability: "nonpayable",
    inputs: [{ type: "bytes32" }],
    outputs: [],
  },
] as const;
const ZERO_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const PROBE_NEXT_ROOT =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

/** Build a canonical publish payload for an on-chain permission probe. */
export function buildPublishPermissionProbe(
  token: `0x${string}`,
  distributor: `0x${string}`,
  expectedRoot: `0x${string}`,
  allowFailureMap: bigint
): `0x${string}` {
  const nextRoot =
    expectedRoot.toLowerCase() === PROBE_NEXT_ROOT.toLowerCase()
      ? ZERO_ROOT
      : PROBE_NEXT_ROOT;
  const mintData = encodeFunctionData({
    abi: MINT_ABI,
    functionName: "mint",
    args: [distributor, 0n],
  });
  const rootData = encodeFunctionData({
    abi: SET_MERKLE_ROOT_ABI,
    functionName: "setMerkleRoot",
    args: [nextRoot],
  });
  return encodeFunctionData({
    abi: DAO_ABI,
    functionName: "execute",
    args: [
      expectedRoot,
      [
        { to: token, value: 0n, data: mintData },
        { to: distributor, value: 0n, data: rootData },
      ],
      allowFailureMap,
    ],
  });
}

export type CasPublishPermissionState = "verified" | "denied" | "loading";

/**
 * A fresh activation is complete only when the canonical publish succeeds and an otherwise
 * identical non-atomic payload fails. Anything else is denied; there is no migration product state.
 */
export function classifyCasPublishPermission(
  validProbe: boolean | undefined,
  nonAtomicProbe: boolean | undefined
): CasPublishPermissionState {
  if (validProbe === undefined || nonAtomicProbe === undefined)
    return "loading";
  return validProbe && !nonAtomicProbe ? "verified" : "denied";
}
