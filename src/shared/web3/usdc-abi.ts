// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/usdc-abi`
 * Purpose: Minimal ERC20 ABI for USDC transfer operations.
 * Scope: Defines transfer function signature only; does not include full ERC20 interface.
 * Invariants: ABI matches ERC20 standard transfer(address,uint256) signature.
 * Side-effects: none
 * Notes: Used by wagmi useWriteContract for on-chain USDC transfers; only includes functions needed for payments.
 * Links: docs/PAYMENTS_FRONTEND_DESIGN.md
 * @public
 */

/**
 * Minimal ERC20 ABI for USDC transfer.
 * Only includes the transfer function needed for payments.
 *
 * Standard ERC20 transfer signature:
 * function transfer(address to, uint256 amount) external returns (bool)
 */
export const USDC_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
