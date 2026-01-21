// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema.scheduling`
 * Purpose: Scheduling tables schema for scheduled graph execution.
 * Scope: Defines execution_grants, schedules, schedule_runs tables. Does not contain queries or logic.
 * Invariants:
 * - execution_grants: Durable authorization for scheduled runs (not user sessions)
 * - schedules: Cron-based graph execution definitions
 * - schedule_runs: Execution ledger for auditability (P0 requirement)
 * - Per SCHEDULER_SPEC.md: job_key = scheduleId:scheduledFor for Graphile Worker
 * - UNIQUE(schedule_id, scheduled_for) on schedule_runs prevents duplicate run records per slot
 * Side-effects: none (schema definitions only)
 * Links: docs/SCHEDULER_SPEC.md, types/scheduling.ts
 * @public
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { billingAccounts, users } from "./refs";

/**
 * Schedule run status values (source of truth for DB enum).
 * - pending: Job enqueued, not yet started
 * - running: Execution in progress
 * - success: Completed successfully
 * - error: Failed with error
 * - skipped: Skipped (disabled schedule or revoked grant)
 */
export const SCHEDULE_RUN_STATUSES = [
  "pending",
  "running",
  "success",
  "error",
  "skipped",
] as const;

export type ScheduleRunStatus = (typeof SCHEDULE_RUN_STATUSES)[number];

/**
 * Execution grants - durable authorization for scheduled graph execution.
 * Per GRANT_NOT_SESSION: Workers authenticate via grants, never user sessions.
 * Per GRANT_SCOPES_CONSTRAIN_GRAPHS: Scopes specify which graphIds can execute.
 *
 * Scope format: "graph:execute:{graphId}" or "graph:execute:*" for wildcard.
 * Example: ["graph:execute:langgraph:poet", "graph:execute:langgraph:research"]
 */
export const executionGrants = pgTable(
  "execution_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    billingAccountId: text("billing_account_id")
      .notNull()
      .references(() => billingAccounts.id, { onDelete: "cascade" }),
    /** Scopes array: ["graph:execute:langgraph:poet", "graph:execute:*"] */
    scopes: text("scopes").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("execution_grants_user_idx").on(table.userId),
    billingAccountIdx: index("execution_grants_billing_account_idx").on(
      table.billingAccountId
    ),
  })
);

/**
 * Schedules - cron-based graph execution definitions.
 * Per SCHEDULER_SPEC.md: next_run_at is updated after each execution.
 * Graphile Worker job_key = scheduleId:scheduledFor prevents duplicate jobs.
 */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    executionGrantId: uuid("execution_grant_id")
      .notNull()
      .references(() => executionGrants.id, { onDelete: "cascade" }),
    /** Graph ID in format provider:name (e.g., "langgraph:poet") */
    graphId: text("graph_id").notNull(),
    /** Graph input payload (messages, model, etc.) */
    input: jsonb("input").$type<unknown>().notNull(),
    /** 5-field cron expression */
    cron: text("cron").notNull(),
    /** IANA timezone (e.g., "UTC", "America/New_York") */
    timezone: text("timezone").notNull(),
    /** Pause/resume toggle */
    enabled: boolean("enabled").notNull().default(true),
    /** Next scheduled execution time (null if disabled or no future runs) */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    /** Last execution start time */
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    ownerIdx: index("schedules_owner_idx").on(table.ownerUserId),
    /** For reconciler: find enabled schedules with stale next_run_at */
    nextRunIdx: index("schedules_next_run_idx").on(table.nextRunAt),
    grantIdx: index("schedules_grant_idx").on(table.executionGrantId),
  })
);

/**
 * Schedule runs - execution ledger for auditability and governance.
 * Per P0 feedback: Minimal run persistence enables debugging and governance loops.
 * UNIQUE(schedule_id, scheduled_for) prevents duplicate run records per time slot.
 */
export const scheduleRuns = pgTable(
  "schedule_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    /** GraphExecutorPort runId for correlation with charge_receipts */
    runId: text("run_id").notNull(),
    /** Intended execution time (the cron slot) */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    /** Actual start time */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** Completion time */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Run status: pending, running, success, error, skipped */
    status: text("status", { enum: SCHEDULE_RUN_STATUSES })
      .notNull()
      .default("pending"),
    /** Retry attempt count (for future use) */
    attemptCount: integer("attempt_count").notNull().default(0),
    /** Langfuse trace ID for observability correlation */
    langfuseTraceId: text("langfuse_trace_id"),
    /** Error message if status is 'error' */
    errorMessage: text("error_message"),
  },
  (table) => ({
    scheduleIdx: index("schedule_runs_schedule_idx").on(table.scheduleId),
    scheduledForIdx: index("schedule_runs_scheduled_for_idx").on(
      table.scheduledFor
    ),
    /** Prevent duplicate run records for the same schedule slot */
    scheduleSlotUnique: uniqueIndex("schedule_runs_schedule_slot_unique").on(
      table.scheduleId,
      table.scheduledFor
    ),
    /** For querying runs by runId (correlation with charge_receipts) */
    runIdIdx: index("schedule_runs_run_id_idx").on(table.runId),
  })
);

/**
 * Execution requests - idempotency layer for graph execution via internal API.
 * Per EXECUTION_IDEMPOTENCY_PERSISTED: Persists idempotency key → {ok, runId, traceId, errorCode}.
 * This is the correctness layer for slot deduplication.
 *
 * Key format: `scheduleId:TemporalScheduledStartTime`
 * Stores BOTH success and error outcomes - retries return the cached outcome.
 * If idempotency_key exists but request_hash differs, reject with 422 (payload mismatch).
 */
export const executionRequests = pgTable("execution_requests", {
  /** Primary key: idempotency key (e.g., `scheduleId:TemporalScheduledStartTime`) */
  idempotencyKey: text("idempotency_key").primaryKey(),
  /** SHA256 hash of normalized request payload for mismatch detection */
  requestHash: text("request_hash").notNull(),
  /** GraphExecutorPort runId for correlation */
  runId: text("run_id").notNull(),
  /** Langfuse trace ID (optional, set when Langfuse is configured) */
  traceId: text("trace_id"),
  /** Execution outcome: true = success, false = error */
  ok: boolean("ok").notNull(),
  /** AiExecutionErrorCode if ok=false, null if ok=true */
  errorCode: text("error_code"),
  /** When request was first received */
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
