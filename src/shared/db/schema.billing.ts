// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema.billing`
 * Purpose: Billing tables schema with minimal charge_receipts for audit trail.
 * Scope: Defines billing_accounts, virtual_keys, credit_ledger, charge_receipts, payment_attempts, payment_events. Does not include auth identity tables.
 * Invariants:
 * - Credits are BIGINT.
 * - billing_accounts.owner_user_id FK → auth.users(id).
 * - payment_attempts has partial unique index on (chain_id, tx_hash) where tx_hash is not null.
 * - credit_ledger(reference) is unique for widget_payment and charge_receipt.
 * - charge_receipts.request_id is idempotency key (unique)
 * - charge_receipts has NOT NULL charge_reason, source_system, source_reference (no defaults, explicit values required)
 * - charge_receipts uses (source_system, source_reference) for generic linking to external systems
 * Side-effects: none (schema definitions only)
 * Links: docs/PAYMENTS_DESIGN.md, docs/ACTIVITY_METRICS.md, types/billing.ts (categorization enums)
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

import { CHARGE_REASONS, SOURCE_SYSTEMS } from "@/types/billing";
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

/**
 * Virtual keys table - scope/FK handle for billing attribution.
 * MVP: service-auth only (no per-user keys). When real API keys are introduced,
 * add key_hash column for hashed credentials.
 */
export const virtualKeys = pgTable("virtual_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  billingAccountId: text("billing_account_id")
    .notNull()
    .references(() => billingAccounts.id, { onDelete: "cascade" }),
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
    /** Idempotency guard for charge_receipt entries per ACTIVITY_METRICS.md */
    chargeReceiptRefUnique: uniqueIndex(
      "credit_ledger_charge_receipt_ref_unique"
    )
      .on(table.reference)
      .where(sql`${table.reason} = 'charge_receipt'`),
  })
);

/**
 * Charge receipts - minimal audit-focused table.
 * LiteLLM is canonical for telemetry (model/tokens). We only store billing data.
 * See docs/ACTIVITY_METRICS.md for design rationale.
 */
export const chargeReceipts = pgTable(
  "charge_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    billingAccountId: text("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    virtualKeyId: uuid("virtual_key_id")
      .notNull()
      .references(() => virtualKeys.id, { onDelete: "cascade" }),
    /** Server-generated UUID, idempotency key */
    requestId: text("request_id").notNull().unique(),
    /** LiteLLM call ID for forensic correlation (x-litellm-call-id header) */
    litellmCallId: text("litellm_call_id"),
    /** Credits debited from user balance */
    chargedCredits: bigint("charged_credits", { mode: "bigint" }).notNull(),
    /** Observational USD cost from LiteLLM (header or usage.cost) */
    responseCostUsd: numeric("response_cost_usd"),
    /** How this receipt was generated: 'response' | 'stream' */
    provenance: text("provenance").notNull(),
    /** Economic/billing category for accounting and analytics */
    chargeReason: text("charge_reason", { enum: CHARGE_REASONS }).notNull(),
    /** External system that originated this charge (e.g. 'litellm', 'stripe') */
    sourceSystem: text("source_system", { enum: SOURCE_SYSTEMS }).notNull(),
    /** Reference ID in the source system for generic linking */
    sourceReference: text("source_reference").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    billingAccountIdx: index("charge_receipts_billing_account_idx").on(
      table.billingAccountId
    ),
    virtualKeyIdx: index("charge_receipts_virtual_key_idx").on(
      table.virtualKeyId
    ),
    // Index for aggregation: Filter by account + range scan on createdAt
    aggregationIdx: index("charge_receipts_aggregation_idx").on(
      table.billingAccountId,
      table.createdAt
    ),
    // Index for pagination: Filter by account + order by createdAt DESC, id DESC
    paginationIdx: index("charge_receipts_pagination_idx").on(
      table.billingAccountId,
      table.createdAt,
      table.id
    ),
    // Index for reverse joins: find charge by (source_system, source_reference)
    sourceLinkIdx: index("charge_receipts_source_link_idx").on(
      table.sourceSystem,
      table.sourceReference
    ),
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
