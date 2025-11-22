// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema.auth`
 * Purpose: Minimal Auth.js schema for JWT-only strategy with SIWE.
 * Scope: Only users table needed for JWT strategy; no database sessions, no OAuth accounts, no email verification.
 * Invariants: wallet_address is the primary user identifier for SIWE authentication.
 * Side-effects: none (schema definitions only)
 * Notes: Auth.js with JWT strategy does not use sessions, accounts, or verification_tokens tables. Re-add those tables if/when OAuth providers are added.
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  walletAddress: text("wallet_address"),
});
