// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema.ai`
 * Purpose: AI invocation telemetry schema for observability and correlation.
 * Scope: Defines ai_invocation_summaries table for telemetry + correlation IDs + reproducibility keys. Does NOT contain query logic.
 * Invariants:
 *   - invocation_id is UNIQUE (idempotency key)
 *   - request_id + trace_id are NOT NULL (correlation required)
 *   - prompt_hash for reproducibility without storing content
 *   - status is 'success' or 'error'
 * Side-effects: none (schema definitions only)
 * Notes: Per AI_SETUP_SPEC.md P0 scope. Separate from charge_receipts (billing).
 * Links: AI_SETUP_SPEC.md, AiTelemetryPort, DrizzleAiTelemetryAdapter
 * @public
 */

import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * AI invocation summaries table.
 *
 * Per AI_SETUP_SPEC.md:
 * - Covers both direct LLM calls and LangGraph runs
 * - NOT billing (that's charge_receipts)
 * - NOT full telemetry (that's LiteLLM /spend/logs)
 * - Provides correlation IDs for resilience + Activity dashboard fallback
 *
 * Columns:
 * - invocation_id: UUID generated per LLM call (UNIQUE, idempotency key)
 * - request_id: User request correlation (multiple rows per request allowed)
 * - trace_id: OTel trace ID from explicit root span
 * - langfuse_trace_id: Same as trace_id when Langfuse enabled (for debug URL)
 * - litellm_call_id: Join key to LiteLLM /spend/logs
 * - prompt_hash: SHA-256 of canonical payload (reproducibility without content)
 * - router_policy_version: Semver or git SHA of model routing policy
 * - graph_run_id/name/version: Optional LangGraph context
 * - provider/model: Resolved target from LiteLLM response
 * - tokens_in/out/total, provider_cost_usd: Usage metrics (nullable for errors)
 * - latency_ms: Call duration
 * - status: 'success' or 'error'
 * - error_code: Low-cardinality classifier (nullable)
 */
export const aiInvocationSummaries = pgTable(
  "ai_invocation_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    // Identity & Correlation
    /** UUID generated per LLM call - UNIQUE idempotency key */
    invocationId: text("invocation_id").notNull().unique(),
    /** Request correlation ID - multiple rows per request allowed */
    requestId: text("request_id").notNull(),
    /** OTel trace ID from explicit root span */
    traceId: text("trace_id").notNull(),
    /** Langfuse trace ID (equals trace_id when Langfuse enabled) */
    langfuseTraceId: text("langfuse_trace_id"),
    /** LiteLLM call ID for join with /spend/logs */
    litellmCallId: text("litellm_call_id"),

    // Reproducibility keys
    /** SHA-256 of canonical outbound payload (model/messages/temperature/tools) */
    promptHash: text("prompt_hash").notNull(),
    /** Semver or git SHA of model routing policy */
    routerPolicyVersion: text("router_policy_version").notNull(),

    // Optional graph context
    /** Identifies graph execution within request */
    graphRunId: text("graph_run_id"),
    /** Which workflow ran (null = direct LLM call) */
    graphName: text("graph_name"),
    /** Git SHA of graph code */
    graphVersion: text("graph_version"),

    // Resolved target
    /** Resolved provider from LiteLLM response (e.g., "openai") */
    provider: text("provider").notNull(),
    /** Resolved model ID from LiteLLM response */
    model: text("model").notNull(),

    // Usage metrics (nullable for error cases)
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    tokensTotal: integer("tokens_total"),
    /** Provider cost in USD (nullable) */
    providerCostUsd: numeric("provider_cost_usd"),

    // Performance
    /** Call duration in milliseconds */
    latencyMs: integer("latency_ms").notNull(),

    // Status
    /** 'success' or 'error' */
    status: text("status").notNull(),
    /** Low-cardinality error classifier: timeout, rate_limited, provider_4xx, provider_5xx, aborted, unknown */
    errorCode: text("error_code"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Index for request correlation (find all invocations for a request)
    requestIdIdx: index("ai_invocation_summaries_request_id_idx").on(
      table.requestId
    ),
    // Index for trace correlation (find all invocations for a trace)
    traceIdIdx: index("ai_invocation_summaries_trace_id_idx").on(table.traceId),
    // Index for LiteLLM joins
    litellmCallIdIdx: index("ai_invocation_summaries_litellm_call_id_idx").on(
      table.litellmCallId
    ),
    // Index for prompt_hash lookups (reproducibility analysis)
    promptHashIdx: index("ai_invocation_summaries_prompt_hash_idx").on(
      table.promptHash
    ),
    // Index for time-based queries
    createdAtIdx: index("ai_invocation_summaries_created_at_idx").on(
      table.createdAt
    ),
    // Index for status filtering
    statusIdx: index("ai_invocation_summaries_status_idx").on(
      table.status,
      table.createdAt
    ),
  })
);
