// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/auth/session`
 * Purpose: Canonical session identity type shared across layers.
 * Scope: Minimal user identity fields used by app facades and adapters; does not contain runtime behavior.
 * Invariants: walletAddress is always present (wallet-first auth); id is always DB UUID; contains only serializable primitives; no runtime behavior.
 * Side-effects: none
 * Notes: walletAddress is required - sessions without wallet address are rejected at getSessionUser() boundary.
 * Links: app/_lib/auth/session, docs/SECURITY_AUTH_SPEC.md
 * @public
 */
export interface SessionUser {
  /**
   * Primary database identifier (UUID).
   * Maps to `users.id` in the `auth` schema.
   * NEVER use wallet address here; use `walletAddress` field instead.
   */
  id: string;
  walletAddress: string;
}
