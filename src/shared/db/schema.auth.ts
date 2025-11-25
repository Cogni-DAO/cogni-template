// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema.auth`
 * Purpose: Minimal NextAuth schema for JWT-only strategy with SIWE.
 * Scope: Only users table needed for JWT strategy. Does not include database sessions, OAuth accounts, or email verification tables.
 * Invariants: wallet_address is the primary user identifier for SIWE authentication.
 * Side-effects: none (schema definitions only)
 * Notes: JWT strategy does not use sessions or accounts tables.
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
  walletAddress: text("wallet_address").unique(),
});
