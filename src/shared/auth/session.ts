// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/auth/session`
 * Purpose: Canonical session identity type shared across layers.
 * Scope: Minimal user identity fields used by app facades and adapters; does not contain runtime behavior.
 * Invariants: Contains only serializable primitives; no runtime behavior.
 * Side-effects: none
 * Notes: Replace/extend when Auth.js introduces richer session metadata.
 * Links: app/_lib/auth/session
 * @public
 */
export interface SessionUser {
  id: string;
  walletAddress?: string;
}
