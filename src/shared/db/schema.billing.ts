// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema.billing`
 * Purpose: Billing tables schema with nullable cost fields and billing status discrimination.
 * Scope: Defines billing_accounts, virtual_keys, credit_ledger, llm_usage with support for incomplete cost data. Does not include auth identity tables.
 * Invariants: BigInt credits, FK to auth.users for owner, billingStatus defaults to needs_review, cost fields nullable for graceful degradation
 * Side-effects: none (schema definitions only)
 * Links: None
 * @public
 */

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./schema.auth";

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

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    billingAccountId: text("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    virtualKeyId: uuid("virtual_key_id")
      .notNull()
      .references(() => virtualKeys.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "bigint" }).notNull(),
    reason: text("reason").notNull(),
    reference: text("reference"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown> | null>()
      .default(null),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    referenceReasonIdx: index("credit_ledger_reference_reason_idx").on(
      table.reference,
      table.reason
    ),
  })
);

export const llmUsage = pgTable(
  "llm_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    billingAccountId: text("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    virtualKeyId: uuid("virtual_key_id")
      .notNull()
      .references(() => virtualKeys.id, { onDelete: "cascade" }),
    requestId: text("request_id"),
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    providerCostUsd: numeric("provider_cost_usd"),
    providerCostCredits: bigint("provider_cost_credits", {
      mode: "bigint",
    }),
    userPriceCredits: bigint("user_price_credits", {
      mode: "bigint",
    }),
    markupFactor: numeric("markup_factor"),
    billingStatus: text("billing_status").notNull().default("needs_review"),
    usage: jsonb("usage").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    billingAccountIdx: index("llm_usage_billing_account_idx").on(
      table.billingAccountId
    ),
    virtualKeyIdx: index("llm_usage_virtual_key_idx").on(table.virtualKeyId),
    requestIdx: index("llm_usage_request_idx").on(table.requestId),
  })
);
