// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/ai-telemetry.port`
 * Purpose: Port interfaces for AI invocation telemetry and Langfuse integration.
 * Scope: Define AiTelemetryPort, LangfusePort, and typed LlmError for error classification. Does NOT contain implementations.
 * Invariants:
 *   - AiTelemetryPort always wired (DB writes even without Langfuse)
 *   - LangfusePort optional (only when LANGFUSE_SECRET_KEY set)
 *   - LlmError provides typed error classification from status codes
 * Side-effects: none (interfaces only)
 * Notes: Per AI_SETUP_SPEC.md P0 scope
 * Links: AI_SETUP_SPEC.md, completion.ts, DrizzleAiTelemetryAdapter
 * @public
 */

/**
 * Error classification kinds for LLM failures.
 * Derived from HTTP status codes, not string heuristics.
 *
 * Per AI_SETUP_SPEC.md error_code mapping:
 * - timeout: kind='timeout' OR status=408
 * - rate_limited: status=429
 * - provider_4xx: status 400-499 (excluding 408, 429)
 * - provider_5xx: status 500-599
 * - aborted: AbortError from AbortSignal
 * - unknown: All other errors
 */
export type LlmErrorKind =
  | "timeout"
  | "rate_limited"
  | "provider_4xx"
  | "provider_5xx"
  | "aborted"
  | "unknown";

/**
 * Typed error for LLM adapter failures.
 * Thrown by litellm.adapter on HTTP errors.
 * Used by completion.ts to extract error_code for telemetry.
 */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status: number | undefined;

  constructor(message: string, kind: LlmErrorKind, status?: number) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Classify LlmError kind from HTTP status code.
 * Per AI_SETUP_SPEC.md: classification from status codes, NOT string heuristics.
 */
export function classifyLlmErrorFromStatus(status: number): LlmErrorKind {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 400 && status < 500) return "provider_4xx";
  if (status >= 500 && status < 600) return "provider_5xx";
  return "unknown";
}

/**
 * Type guard for LlmError.
 */
export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}

/**
 * Invocation status for telemetry recording.
 */
export type InvocationStatus = "success" | "error";

/**
 * Parameters for recording an AI invocation to the telemetry store.
 * Per AI_SETUP_SPEC.md ai_invocation_summaries schema.
 */
export interface RecordInvocationParams {
  // Identity & Correlation
  invocationId: string; // UUID, idempotency key (UNIQUE)
  requestId: string; // Request correlation ID
  traceId: string; // OTel trace ID

  // Optional external IDs
  langfuseTraceId?: string; // Langfuse trace ID (same as traceId when enabled)
  litellmCallId?: string; // LiteLLM call ID for /spend/logs join

  // Reproducibility keys
  promptHash: string; // SHA-256 of canonical outbound payload
  routerPolicyVersion: string; // Semver or git SHA of routing policy

  // Optional graph context
  graphRunId?: string;
  graphName?: string;
  graphVersion?: string;

  // Resolved target
  provider: string; // e.g., "openai", "anthropic"
  model: string; // e.g., "gpt-4o", "claude-3-5-sonnet"

  // Usage metrics (nullable for error cases)
  tokensIn?: number;
  tokensOut?: number;
  tokensTotal?: number;
  providerCostUsd?: number;
  latencyMs: number;

  // Status
  status: InvocationStatus;
  errorCode?: LlmErrorKind; // Only when status='error'
}

/**
 * Port for recording AI invocation telemetry.
 * Always wired (DrizzleAiTelemetryAdapter) - works even without Langfuse.
 */
export interface AiTelemetryPort {
  /**
   * Record an AI invocation summary.
   * Called on BOTH success AND error paths.
   * Uses invocationId as idempotency key (UNIQUE constraint).
   */
  recordInvocation(params: RecordInvocationParams): Promise<void>;
}

/**
 * Port for optional Langfuse SDK integration.
 * Only wired when LANGFUSE_SECRET_KEY is set.
 */
export interface LangfusePort {
  /**
   * Create a Langfuse trace with the given trace ID.
   * Uses traceId from OTel for correlation.
   *
   * @param traceId - OTel trace ID to use as Langfuse trace ID
   * @param metadata - Additional trace metadata
   * @returns The trace ID on success
   * @throws Error if trace creation fails
   */
  createTrace(
    traceId: string,
    metadata: {
      requestId: string;
      model: string;
      promptHash: string;
    }
  ): Promise<string>;

  /**
   * Record generation metrics on the trace.
   *
   * @param traceId - The trace to update
   * @param generation - Generation metrics
   */
  recordGeneration(
    traceId: string,
    generation: {
      model: string;
      tokensIn?: number;
      tokensOut?: number;
      latencyMs: number;
      providerCostUsd?: number;
      status: InvocationStatus;
      errorCode?: LlmErrorKind;
    }
  ): void;

  /**
   * Flush pending traces.
   * Only call if trace was created; never await on request path.
   */
  flush(): Promise<void>;
}
