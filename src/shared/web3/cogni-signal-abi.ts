// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/cogni-signal-abi`
 * Purpose: Minimal CogniSignal ABI needed for Node Formation P0.
 * Scope: ABI constants only.
 * Invariants: Minimal surface; only include what P0 uses.
 * Side-effects: none
 * @public
 */

export const COGNI_SIGNAL_ABI = [
  {
    type: "function",
    name: "DAO",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;
