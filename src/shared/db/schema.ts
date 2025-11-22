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
  bigint,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Billing accounts table - tracks credit balances for LiteLLM virtual keys
 * Maps to billing identity derived from Auth.js user.id
 */
export const billingAccounts = pgTable("billing_accounts", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").notNull().unique(),
  balanceCredits: bigint("balance_credits", { mode: "number" })
    .notNull()
    .default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * LiteLLM virtual keys associated with billing accounts
 */
export const virtualKeys = pgTable("virtual_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  billingAccountId: text("billing_account_id")
    .notNull()
    .references(() => billingAccounts.id, { onDelete: "cascade" }),
  litellmVirtualKey: text("litellm_virtual_key").notNull(),
  label: text("label").default("Default"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
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
  billingAccountId: text("billing_account_id")
    .notNull()
    .references(() => billingAccounts.id, { onDelete: "cascade" }),
  virtualKeyId: uuid("virtual_key_id")
    .notNull()
    .references(() => virtualKeys.id, { onDelete: "cascade" }),
  amount: bigint("amount", { mode: "number" }).notNull(),
  balanceAfter: bigint("balance_after", { mode: "number" })
    .notNull()
    .default(0),
  reason: text("reason").notNull(),
  reference: text("reference"),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown> | null>()
    .default(null),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
