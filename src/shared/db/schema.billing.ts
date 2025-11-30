// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema.billing`
 * Purpose: Billing tables schema with nullable cost fields and billing status discrimination.
 * Scope: Defines billing_accounts, virtual_keys, credit_ledger, llm_usage, payment_attempts, payment_events. Does not include auth identity tables.
 * Invariants:
 * - Credits are BIGINT.
 * - billing_accounts.owner_user_id FK → auth.users(id).
 * - payment_attempts has partial unique index on (chain_id, tx_hash) where tx_hash is not null.
 * - credit_ledger(reference) is unique for widget_payment.
 * Side-effects: none (schema definitions only)
 * Links: docs/PAYMENTS_DESIGN.md
 * @public
 */

import { sql } from "drizzle-orm";
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
  uniqueIndex,
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
    paymentRefUnique: uniqueIndex("credit_ledger_payment_ref_unique")
      .on(table.reference)
      .where(sql`${table.reason} = 'widget_payment'`),
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

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    billingAccountId: text("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    fromAddress: text("from_address").notNull(),
    chainId: integer("chain_id").notNull(),
    txHash: text("tx_hash"),
    token: text("token").notNull(),
    toAddress: text("to_address").notNull(),
    amountRaw: bigint("amount_raw", { mode: "bigint" }).notNull(),
    amountUsdCents: integer("amount_usd_cents").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lastVerifyAttemptAt: timestamp("last_verify_attempt_at", {
      withTimezone: true,
    }),
    verifyAttemptCount: integer("verify_attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    chainTxUnique: uniqueIndex("payment_attempts_chain_tx_unique")
      .on(table.chainId, table.txHash)
      .where(sql`${table.txHash} IS NOT NULL`),
    billingAccountIdx: index("payment_attempts_billing_account_idx").on(
      table.billingAccountId,
      table.createdAt
    ),
    statusIdx: index("payment_attempts_status_idx").on(
      table.status,
      table.createdAt
    ),
  })
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => paymentAttempts.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    errorCode: text("error_code"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    attemptIdx: index("payment_events_attempt_idx").on(
      table.attemptId,
      table.createdAt
    ),
  })
);
