// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/web3`
 * Purpose: Barrel export for web3 chain configuration.
 * Scope: Re-exports chain configuration helpers/constants; does not contain runtime logic or side effects.
 * Invariants: Exports both framework-agnostic config (chain.ts) and wagmi adapter (evm-wagmi.ts).
 * Side-effects: none
 * Links: docs/PAYMENTS_DESIGN.md, docs/ONCHAIN_READERS.md
 * @public
 */

export * from "./block-explorer";
export * from "./chain";
export * from "./erc20-abi";
export * from "./evm-wagmi";
