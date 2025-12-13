// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/aragon-abi`
 * Purpose: Minimal Aragon OSx ABIs needed for Node Formation P0.
 * Scope: ABI constants only.
 * Invariants: Keep minimal surface; do not add unrelated functions/events.
 * Side-effects: none
 * @public
 */

/** DAOFactory minimal ABI (createDao). */
export const DAO_FACTORY_ABI = [
  {
    type: "function",
    name: "createDao",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_metadata", type: "bytes" },
      {
        name: "_daoSettings",
        type: "tuple",
        components: [
          { name: "subdomain", type: "string" },
          { name: "trustedForwarder", type: "address" },
          { name: "daoURI", type: "string" },
        ],
      },
      {
        name: "_pluginSettings",
        type: "tuple[]",
        components: [
          { name: "pluginSetupRef", type: "tuple", components: [
            { name: "pluginSetupRepo", type: "address" },
            { name: "versionTag", type: "tuple", components: [
              { name: "release", type: "uint16" },
              { name: "build", type: "uint16" },
            ] },
          ] },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [
      { name: "dao", type: "address" },
      { name: "installedPlugins", type: "address[]" },
    ],
  },
] as const;

/** TokenVoting minimal ABI. */
export const TOKEN_VOTING_ABI = [
  {
    type: "function",
    name: "getVotingToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "token", type: "address" }],
  },
] as const;

/** GovernanceERC20 minimal ABI. */
export const GOVERNANCE_ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
