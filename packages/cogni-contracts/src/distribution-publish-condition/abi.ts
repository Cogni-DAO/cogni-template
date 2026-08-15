// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/contracts/distribution-publish-condition/abi`
 * Purpose: ABI for the Cogni-authored `DistributionPublishCondition` — the scoped
 *   Aragon OSx `IPermissionCondition` that restricts a node executor's EXECUTE grant
 *   to the publish action set only.
 * Scope: ABI constant only; does not include bytecode or addresses.
 * Invariants: ABI must match the compiled artifact from
 *   `src/distribution-publish-condition/DistributionPublishCondition.sol` at the pinned
 *   compiler settings (see bytecode.ts provenance).
 * Side-effects: none
 * Links: docs/spec/tokenomics-distribution.md
 * @public
 */

/**
 * `DistributionPublishCondition` ABI.
 *
 * AUTHORED by Cogni (unlike the vendored 1inch distributor). Standalone contract that
 * implements Aragon OSx `IPermissionCondition`: bound via
 * `grantWithCondition(where=DAO, who=executor, EXECUTE_PERMISSION, condition)`, its
 * `isGranted` decodes the `DAO.execute` calldata and returns true ONLY when the action
 * set is exactly `[token.mint(distributor, *), distributor.setMerkleRoot(*)]` — nothing
 * else, no third action, no other target. Two immutables set at deploy:
 * `constructor(address token, address distributor)`.
 *
 * Source:    packages/cogni-contracts/src/distribution-publish-condition/
 *              DistributionPublishCondition.sol
 * Compiler:  solc 0.8.24+commit.e11b9ed9, optimizer enabled (200 runs).
 * Deps:      none — `IPermissionCondition` + `Action` are inlined in the source.
 *
 * Constructor: (address _token, address _distributor) — both immutable.
 */
export const DISTRIBUTION_PUBLISH_CONDITION_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_token", type: "address", internalType: "address" },
      { name: "_distributor", type: "address", internalType: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "distributor",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isGranted",
    inputs: [
      { name: "", type: "address", internalType: "address" },
      { name: "", type: "address", internalType: "address" },
      { name: "", type: "bytes32", internalType: "bytes32" },
      { name: "_data", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "token",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
] as const;
