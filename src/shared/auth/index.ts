// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/auth`
 * Purpose: Barrel export for shared auth types used across app and adapters.
 * Scope: Re-exports session identity types; does not implement runtime logic or side effects.
 * Invariants: Pure re-export, no mutations, no environment access.
 * Side-effects: none
 * Notes: Keep aligned with session.ts definitions; expand when auth surface grows.
 * Links: shared/auth/session
 * @public
 */
export * from "./session";
