// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-core/tooling/ai-span`
 * Purpose: Provider-agnostic span interface for AI tool instrumentation.
 * Scope: Minimal interface for span creation and completion. Does not depend on any provider SDK.
 * Invariants: Pure types, no runtime dependencies
 * Side-effects: none
 * Notes: Per OBSERVABILITY.md LANGFUSE_TOOL_SPANS_NOT_LOGS - used by tool-runner for span instrumentation.
 * Links: tool-runner.ts, LangfuseAdapter
 * @public
 */

/**
 * Handle for an active span.
 * Returned by startSpan(), call end() when operation completes.
 */
export interface AiSpanHandle {
  spanId: string;
  end: (params: {
    output?: unknown;
    level?: "DEFAULT" | "WARNING" | "ERROR";
    metadata?: Record<string, unknown>;
  }) => void;
}

/**
 * Provider-agnostic interface for AI span instrumentation.
 * Implemented by observability adapters (e.g., LangfuseAdapter).
 * Used by tool-runner for tool span visibility.
 */
export interface AiSpanPort {
  /**
   * Start a span for an operation.
   *
   * @param params - Span creation params
   * @returns Handle with spanId and end() method
   */
  startSpan(params: {
    traceId: string;
    name: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
  }): AiSpanHandle;
}
