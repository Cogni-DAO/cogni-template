// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema`
 * Purpose: Drizzle database schema definitions for all application tables.
 * Scope: Database table schemas and relationships. Does not handle connections or migrations.
 * Invariants: All tables have proper types and constraints
 * Side-effects: none (schema definitions only)
 * Notes: Used by Drizzle ORM for type generation and migrations
 * Links: Used by adapters for database operations
 * @public
 */

import {
  decimal,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Accounts table - tracks internal credit balances for LiteLLM virtual keys
 * Maps to LlmCaller.accountId from the authentication layer
 */
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  balanceCredits: decimal("balance_credits", { precision: 10, scale: 2 })
    .notNull()
    .default("0.00"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Credit ledger table - source of truth for all credit debits/credits
 * Maintains append-only audit log with metadata for each balance mutation
 */
export const creditLedger = pgTable("credit_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  delta: decimal("delta", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason").notNull(),
  reference: text("reference"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown> | null>()
    .default(null),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
