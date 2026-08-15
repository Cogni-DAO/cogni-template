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

import { keccak256, toBytes } from "viem";

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
 *   - `grant`          (nonpayable) — the ONE-TIME authorize action (wrapped in a
 *     createProposal so the DAO grants EXECUTE_PERMISSION on itself to the executor).
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
    type: "function",
    name: "grant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_where", type: "address", internalType: "address" },
      { name: "_who", type: "address", internalType: "address" },
      { name: "_permissionId", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
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
