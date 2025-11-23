// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/auth`
 * Purpose: Barrel export for shared auth types and pure helpers used across app and adapters.
 * Scope: Re-exports session identity types and wallet-session consistency logic; does not implement runtime side effects.
 * Invariants: Pure re-export, no mutations, no environment access.
 * Side-effects: none
 * Notes: Keep aligned with session.ts and wallet-session.ts definitions; expand when auth surface grows.
 * Links: shared/auth/session, shared/auth/wallet-session
 * @public
 */
export * from "./session";
export * from "./wallet-session";
