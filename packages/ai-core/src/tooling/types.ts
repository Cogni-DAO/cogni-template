// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/tooling/types`
 * Purpose: Canonical semantic types for tool definitions and invocations.
 * Scope: Framework-agnostic types for tool definitions. Does NOT import Zod — uses JSONSchema7 for wire formats.
 * Invariants:
 *   - TOOL_SEMANTICS_CANONICAL: These are the canonical types; wire formats are adapters
 *   - No Zod dependency — compiled from @cogni/ai-tools via toToolSpec()
 *   - ToolSpec uses JSONSchema7 for inputSchema (compiled from Zod)
 * Side-effects: none (types only)
 * Links: TOOL_USE_SPEC.md
 * @public
 */

import type { JSONSchema7 } from "json-schema";

/**
 * Redaction mode for tool output.
 * P0 supports only top_level_only — filter top-level keys by allowlist.
 */
export type RedactionMode = "top_level_only";

/**
 * Redaction configuration for tool output.
 */
export interface ToolRedactionConfig {
  /** Redaction strategy (P0: top_level_only) */
  readonly mode: RedactionMode;
  /** Fields that are safe to expose to UI/logs */
  readonly allowlist: readonly string[];
}

/**
 * Tool specification — canonical definition for wire formats.
 *
 * This is the compiled form of ToolContract (Zod → JSONSchema7).
 * Used by wire encoders (OpenAI, Anthropic) to emit tool definitions.
 *
 * Per TOOL_SEMANTICS_CANONICAL: inputSchema must conform to P0-supported
 * JSONSchema subset. Disallow oneOf/anyOf/allOf/not/if-then-else/patternProperties.
 */
export interface ToolSpec {
  /** Stable tool name (snake_case) */
  readonly name: string;
  /** Human-readable description for LLM */
  readonly description: string;
  /** JSONSchema7 for input validation (compiled from Zod) */
  readonly inputSchema: JSONSchema7;
  /** Redaction config for output */
  readonly redaction: ToolRedactionConfig;
  /**
   * Hash of the compiled schema for drift detection and promptHash computation.
   * Optional for P0. Compute in Node-only layer with stable stringify if needed.
   */
  readonly schemaHash?: string;
}

/**
 * Known error codes for tool execution failures.
 * Extensible union for future error types.
 */
export type ToolErrorCode =
  | "validation"
  | "execution"
  | "unavailable"
  | "redaction_failed"
  | "invalid_json"
  | "timeout";

/**
 * Tool invocation record — captures full lifecycle of a tool call.
 *
 * Used for:
 * - Telemetry/observability
 * - Passing tool results back to LLM
 * - Audit logging
 *
 * Per TOOL_SEMANTICS_CANONICAL: `raw` preserves provider-native payload
 * for observability only; must be redacted/omitted from UI/logs.
 */
export interface ToolInvocationRecord {
  /** Stable ID for this tool call (model-provided or UUID) */
  readonly toolCallId: string;
  /** Tool name that was invoked */
  readonly name: string;
  /** Parsed arguments passed to tool (flexible shape) */
  readonly args: unknown;
  /** Tool execution result (redacted for UI safety, flexible shape) */
  readonly result?: unknown;
  /** Error info if tool execution failed */
  readonly error?: {
    readonly code: ToolErrorCode;
    readonly message: string;
  };
  /** When tool execution started (epoch milliseconds for serialization) */
  readonly startedAtMs: number;
  /** When tool execution completed (epoch milliseconds) */
  readonly endedAtMs?: number;
  /**
   * Raw provider-native payload for observability.
   * Must be redacted/omitted from UI/logs. Never influences execution or billing.
   */
  readonly raw?: unknown;
}
