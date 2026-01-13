// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai/observability-executor.decorator`
 * Purpose: Decorator that wraps GraphExecutorPort with Langfuse observability.
 * Scope: Creates root trace with input, updates output on terminal, handles all 4 terminal states. Does not execute graphs directly (delegates to inner).
 * Invariants:
 *   - LANGFUSE_OTEL_TRACE_CORRELATION: Uses ctx.traceId (OTel) as Langfuse trace ID
 *   - LANGFUSE_TERMINAL_ONCE_GUARD: Exactly one terminal outcome per trace
 *   - LANGFUSE_NON_NULL_IO: Non-null input at start, non-null output on terminal
 *   - LANGFUSE_SCRUB_BEFORE_SEND: All content scrubbed before Langfuse
 * Side-effects: IO (Langfuse API calls via adapter)
 * Links: OBSERVABILITY.md#langfuse-integration, LangfuseAdapter
 * @public
 */

import { randomUUID } from "node:crypto";

import type { Logger } from "pino";
import type {
  GraphExecutorPort,
  GraphFinal,
  GraphRunRequest,
  GraphRunResult,
  LangfusePort,
} from "@/ports";
import {
  applyUserMaskingPreference,
  isValidOtelTraceId,
  scrubTraceInput,
  scrubTraceOutput,
  truncateSessionId,
} from "@/shared/ai/langfuse-scrubbing";
import { EVENT_NAMES } from "@/shared/observability/events";
import type { AiEvent } from "@/types/ai-events";

/**
 * Terminal state tracking for once-guard.
 */
interface TerminalState {
  resolved: boolean;
  outcome?: "success" | "error" | "aborted" | "finalization_lost";
  finalizationTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Configuration for the observability decorator.
 */
export interface ObservabilityDecoratorConfig {
  /** Finalization lost timeout in ms (default: 15000) */
  finalizationTimeoutMs?: number;
}

/**
 * Decorator that wraps GraphExecutorPort with Langfuse observability.
 *
 * Per OBSERVABILITY.md#langfuse-integration:
 * - Creates trace with scrubbed input at start
 * - Updates trace with scrubbed output on terminal
 * - Handles all 4 terminal states: success, error, aborted, finalization_lost
 * - Once-guard ensures exactly one terminal outcome per trace
 */
export class ObservabilityGraphExecutorDecorator implements GraphExecutorPort {
  private readonly finalizationTimeoutMs: number;

  constructor(
    private readonly inner: GraphExecutorPort,
    private readonly langfuse: LangfusePort | undefined,
    config: ObservabilityDecoratorConfig,
    private readonly log: Logger
  ) {
    this.finalizationTimeoutMs = config.finalizationTimeoutMs ?? 15_000;
  }

  /**
   * Execute graph with Langfuse observability.
   * Wraps inner executor, creates trace, handles terminal state.
   */
  runGraph(req: GraphRunRequest): GraphRunResult {
    const { runId, graphName, messages, caller, ingressRequestId } = req;

    // Extract providerId from graphName (e.g., "langgraph:poet" → "langgraph")
    const providerId = graphName?.split(":")[0] ?? "unknown";

    // Validate traceId - use OTel if valid, otherwise generate with correlation
    let traceId: string;
    let otelTraceIdForMetadata: string | undefined;

    if (isValidOtelTraceId(caller.traceId)) {
      traceId = caller.traceId;
    } else {
      // Generate Langfuse ID, store original for correlation
      traceId = randomUUID().replace(/-/g, "");
      otelTraceIdForMetadata = caller.traceId;
      this.log.warn(
        { originalTraceId: caller.traceId, generatedTraceId: traceId },
        "Invalid OTel traceId format; generated Langfuse ID"
      );
    }

    // Scrub input for Langfuse
    const scrubbedInput = scrubTraceInput(messages);
    const finalInput = applyUserMaskingPreference(
      scrubbedInput,
      caller.maskContent ?? false
    );

    // Create Langfuse trace
    let langfuseTraceId: string | undefined;
    if (this.langfuse) {
      try {
        const sessionId = truncateSessionId(caller.sessionId);
        langfuseTraceId = this.langfuse.createTraceWithIO({
          traceId,
          ...(sessionId && { sessionId }),
          ...(caller.userId && { userId: caller.userId }),
          input: finalInput,
          tags: [providerId, graphName ?? "unknown"],
          metadata: {
            runId,
            reqId: ingressRequestId,
            graphId: graphName,
            providerId,
            billingAccountId: caller.billingAccountId,
            ...(otelTraceIdForMetadata && {
              otelTraceId: otelTraceIdForMetadata,
            }),
          },
        });

        // Log trace created (per OBSERVABILITY.md: 2-4 events per request)
        this.log.info(
          {
            reqId: ingressRequestId,
            traceId,
            langfuseTraceId,
            graphId: graphName,
            event: EVENT_NAMES.LANGFUSE_TRACE_CREATED,
          },
          EVENT_NAMES.LANGFUSE_TRACE_CREATED
        );
      } catch (error) {
        this.log.error(
          { err: error, runId, graphName },
          "Failed to create Langfuse trace"
        );
      }
    }

    // Terminal state management with once-guard
    const terminal: TerminalState = { resolved: false };
    let assistantFinalContent: string | null = null;
    let streamEnded = false;

    /**
     * Resolve terminal outcome exactly once.
     * Per LANGFUSE_TERMINAL_ONCE_GUARD: first resolution wins.
     * Per FINAL_CONTENT_OVER_STREAM: prefer final.content over stream-captured content.
     */
    const resolveTerminal = async (
      outcome: NonNullable<TerminalState["outcome"]>,
      details: {
        error?: string;
        finishReason?: string;
        usage?: { promptTokens: number; completionTokens: number };
        content?: string;
      }
    ): Promise<void> => {
      // Once-guard
      if (terminal.resolved) return;
      terminal.resolved = true;
      terminal.outcome = outcome;

      // Clear finalization timer if set
      if (terminal.finalizationTimer) {
        clearTimeout(terminal.finalizationTimer);
        delete terminal.finalizationTimer;
      }

      // Prefer final.content (deterministic) over stream-captured (unreliable)
      const outputContent = details.content ?? assistantFinalContent;

      // Scrub output for Langfuse
      const scrubbedOutput = scrubTraceOutput(outputContent, {
        status: outcome,
        ...(details.finishReason && { finishReason: details.finishReason }),
        ...(details.error && { errorCode: details.error }),
        ...(details.usage && { usage: details.usage }),
      });
      const finalOutput = applyUserMaskingPreference(
        scrubbedOutput,
        caller.maskContent ?? false
      );

      // Update Langfuse trace output
      if (this.langfuse && langfuseTraceId) {
        this.langfuse.updateTraceOutput(traceId, finalOutput);

        // Flush in background
        this.langfuse
          .flush()
          .catch((err) =>
            this.log.warn({ err }, "Langfuse flush failed on terminal")
          );
      }

      // Log trace completed
      this.log.info(
        {
          reqId: ingressRequestId,
          traceId,
          langfuseTraceId,
          outcome,
          event: EVENT_NAMES.LANGFUSE_TRACE_COMPLETED,
        },
        EVENT_NAMES.LANGFUSE_TRACE_COMPLETED
      );
    };

    // Delegate to inner executor
    const result = this.inner.runGraph(req);

    // Wrap stream to intercept events
    const wrappedStream = this.wrapStream(result.stream, {
      onAssistantFinal: (content) => {
        assistantFinalContent = content;
      },
      onDone: () => {
        streamEnded = true;
        if (assistantFinalContent === null && !terminal.resolved) {
          // Done without assistant_final - start finalization_lost timer
          terminal.finalizationTimer = setTimeout(() => {
            void resolveTerminal("finalization_lost", {});
          }, this.finalizationTimeoutMs);
        }
      },
      onError: (code) => {
        void resolveTerminal("error", { error: code });
      },
    });

    // Handle stream ending without done event (edge case)
    const handleStreamEnd = (): void => {
      if (!streamEnded && !terminal.resolved) {
        // Stream ended without done - start finalization timer
        terminal.finalizationTimer = setTimeout(() => {
          void resolveTerminal("finalization_lost", {});
        }, this.finalizationTimeoutMs);
      }
    };

    // Wrap final promise
    const wrappedFinal = result.final
      .then(async (final: GraphFinal) => {
        handleStreamEnd();
        if (final.ok) {
          await resolveTerminal("success", {
            ...(final.finishReason && { finishReason: final.finishReason }),
            ...(final.usage && { usage: final.usage }),
            ...(final.content && { content: final.content }),
          });
        } else {
          await resolveTerminal("error", {
            ...(final.error && { error: final.error }),
          });
        }
        return final;
      })
      .catch(async (err: Error) => {
        handleStreamEnd();
        const isAbort = err?.name === "AbortError";
        await resolveTerminal(isAbort ? "aborted" : "error", {
          error: isAbort ? "aborted" : "internal",
        });
        throw err;
      });

    return { stream: wrappedStream, final: wrappedFinal };
  }

  /**
   * Wrap stream to intercept events for terminal state tracking.
   */
  private wrapStream(
    stream: AsyncIterable<AiEvent>,
    hooks: {
      onAssistantFinal: (content: string) => void;
      onDone: () => void;
      onError: (code: string) => void;
    }
  ): AsyncIterable<AiEvent> {
    return {
      [Symbol.asyncIterator]: () => {
        const iterator = stream[Symbol.asyncIterator]();
        return {
          async next() {
            const result = await iterator.next();
            if (!result.done) {
              const event = result.value;
              if (event.type === "assistant_final") {
                hooks.onAssistantFinal(event.content);
              } else if (event.type === "done") {
                hooks.onDone();
              } else if (event.type === "error") {
                hooks.onError(event.error);
              }
            }
            return result;
          },
          async return(value?: unknown) {
            // Stream ended early (e.g., consumer stopped iterating)
            hooks.onDone();
            return iterator.return?.(value) ?? { done: true, value: undefined };
          },
          async throw(err?: unknown) {
            return iterator.throw?.(err) ?? { done: true, value: undefined };
          },
        };
      },
    };
  }

  /**
   * Delegate listGraphs to inner executor.
   */
  listGraphs() {
    if ("listGraphs" in this.inner) {
      return (this.inner as { listGraphs: () => unknown }).listGraphs();
    }
    return [];
  }
}
