// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/execution/error-codes`
 * Purpose: Canonical error codes, error class, and normalization for AI execution failures.
 * Scope: Single source of truth for execution error codes and normalization logic. Does NOT define business logic.
 * Invariants:
 *   - SINGLE_SOURCE_OF_TRUTH: All error codes defined here, imported everywhere else
 *   - ERROR_NORMALIZATION_ONCE: normalizeErrorToExecutionCode() is the canonical normalizer
 *   - AiExecutionError carries structured code through call chains
 *   - Recognizes both AiExecutionError (.code) and LlmError (.kind, .status)
 * Side-effects: none
 * Links: GRAPH_EXECUTION.md, ERROR_HANDLING_ARCHITECTURE.md, llm-errors.ts
 * @public
 */

import { isLlmError } from "./llm-errors";

/**
 * Canonical error codes for AI execution failures.
 * - invalid_request: Required input missing or malformed (client error)
 * - not_found: Requested resource (e.g., graph) does not exist (client error)
 * - timeout: Request exceeded time limit
 * - aborted: Request was cancelled (e.g., AbortSignal)
 * - rate_limit: Provider rate limit exceeded (HTTP 429)
 * - internal: Unexpected error during execution (server fault)
 * - insufficient_credits: Billing account lacks sufficient credits
 */
export const AI_EXECUTION_ERROR_CODES = [
  "invalid_request",
  "not_found",
  "timeout",
  "aborted",
  "rate_limit",
  "internal",
  "insufficient_credits",
] as const;

export type AiExecutionErrorCode = (typeof AI_EXECUTION_ERROR_CODES)[number];

/**
 * Type guard for AiExecutionErrorCode.
 * Validates that a value is a known error code at runtime.
 */
export function isAiExecutionErrorCode(x: unknown): x is AiExecutionErrorCode {
  return (
    typeof x === "string" &&
    AI_EXECUTION_ERROR_CODES.includes(x as AiExecutionErrorCode)
  );
}

/**
 * Error class that carries a structured AiExecutionErrorCode.
 * Used by CompletionUnitLLM and other layers to propagate error codes
 * without losing type information through the call chain.
 */
export class AiExecutionError extends Error {
  readonly code: AiExecutionErrorCode;

  constructor(code: AiExecutionErrorCode, message?: string) {
    super(message ?? `AI execution failed: ${code}`);
    this.name = "AiExecutionError";
    this.code = code;
  }
}

/**
 * Type guard for AiExecutionError.
 */
export function isAiExecutionError(error: unknown): error is AiExecutionError {
  return error instanceof AiExecutionError;
}

/**
 * Normalize any error to stable AiExecutionErrorCode.
 *
 * Priority:
 * 1. AbortError → "aborted"
 * 2. AiExecutionError (.code field) → use code
 * 3. LlmError (.status, .kind) → map to code
 * 4. Default → "internal"
 */
export function normalizeErrorToExecutionCode(
  error: unknown
): AiExecutionErrorCode {
  // AbortError takes precedence
  if (error instanceof Error && error.name === "AbortError") {
    return "aborted";
  }

  // AiExecutionError with structured code
  if (error instanceof Error) {
    const errorWithCode = error as { code?: unknown };
    if (isAiExecutionErrorCode(errorWithCode.code)) {
      return errorWithCode.code;
    }
  }

  // LlmError with status/kind classification
  if (isLlmError(error)) {
    // Status-first (most reliable - HTTP status code)
    if (error.status === 429) return "rate_limit";
    if (error.status === 408) return "timeout";

    // Kind fallback
    switch (error.kind) {
      case "rate_limited":
        return "rate_limit";
      case "timeout":
        return "timeout";
      case "aborted":
        return "aborted";
      default:
        return "internal";
    }
  }

  // Unknown error type
  return "internal";
}
