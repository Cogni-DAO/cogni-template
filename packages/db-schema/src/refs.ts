// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-schema/refs`
 * Purpose: FK target tables - canonical home for tables referenced across domain slices.
 * Scope: Defines users and billingAccounts tables only. Does not contain domain-specific tables.
 * Invariants:
 * - This is the ROOT of the schema DAG - imports nothing from other slices
 * - All cross-slice FK references point to tables defined here
 * - FORBIDDEN: Importing from scheduling, auth, billing slices (would create cycles)
 * Side-effects: none (schema definitions only)
 * Links: docs/PACKAGES_ARCHITECTURE.md
 * @public
 */

import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Users table - primary identity table for SIWE authentication.
 * FK target for: billingAccounts, executionGrants, schedules
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  walletAddress: text("wallet_address").unique(),
});

/**
 * Billing accounts table - per-user billing entity.
 * FK target for: executionGrants, virtualKeys, creditLedger, chargeReceipts, paymentAttempts
 */
export const billingAccounts = pgTable("billing_accounts", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  balanceCredits: bigint("balance_credits", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
