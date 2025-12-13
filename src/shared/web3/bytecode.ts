// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3/bytecode`
 * Purpose: Bytecode constants for client-side deployments.
 * Scope: Constants only. No dynamic fetching.
 * Invariants: Bytecode must be a 0x-prefixed hex string.
 * Side-effects: none
 * @public
 */

/**
 * CogniSignal deployment bytecode.
 *
 * IMPORTANT: This repo does not currently vendor the compiled artifact.
 * To enable deployments, replace this with the actual compiled bytecode.
 */
export const COGNI_SIGNAL_BYTECODE = "0x" as const;
