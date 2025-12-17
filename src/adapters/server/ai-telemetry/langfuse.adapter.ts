// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/ai-telemetry/langfuse.adapter`
 * Purpose: Langfuse SDK implementation of LangfusePort for trace correlation.
 * Scope: Create Langfuse traces with OTel trace ID; optional (only when LANGFUSE_SECRET_KEY set). Does NOT handle DB writes.
 * Invariants:
 *   - Uses OTel traceId as Langfuse trace ID for correlation
 *   - flush() only if trace was created; never await on request path
 *   - createTrace() throws on failure; caller handles graceful degradation
 * Side-effects: IO (Langfuse API calls)
 * Notes: Per AI_SETUP_SPEC.md P0 scope
 * Links: LangfusePort, OTel traceId correlation
 * @public
 */

import { Langfuse } from "langfuse";
import type { InvocationStatus, LangfusePort, LlmErrorKind } from "@/ports";

export interface LangfuseAdapterConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

/**
 * Langfuse SDK implementation of LangfusePort.
 * Optional adapter - only wired when LANGFUSE_SECRET_KEY is set.
 *
 * Per AI_SETUP_SPEC.md:
 * - Creates trace with id = OTel traceId (same ID for correlation)
 * - Flush only if trace created; never await on request path
 */
export class LangfuseAdapter implements LangfusePort {
  private readonly langfuse: Langfuse;
  private readonly activeTraces = new Set<string>();

  constructor(config: LangfuseAdapterConfig) {
    this.langfuse = new Langfuse({
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    });
  }

  /**
   * Create a Langfuse trace with the OTel trace ID.
   * Uses traceId from OTel for correlation.
   *
   * @throws Error if trace creation fails (caller handles graceful degradation)
   */
  async createTrace(
    traceId: string,
    metadata: {
      requestId: string;
      model: string;
      promptHash: string;
    }
  ): Promise<string> {
    // No try/catch - let errors propagate to caller for graceful degradation
    // Caller wraps in try/catch and sets langfuseTraceId = undefined on failure
    this.langfuse.trace({
      id: traceId, // Use OTel traceId as Langfuse trace ID
      name: "llm-completion",
      metadata: {
        requestId: metadata.requestId,
        model: metadata.model,
        promptHash: metadata.promptHash,
      },
    });
    this.activeTraces.add(traceId);
    return traceId;
  }

  /**
   * Record generation metrics on the trace.
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
  ): void {
    try {
      // Build generation params conditionally to satisfy exact optional property types
      const generationParams: Parameters<typeof this.langfuse.generation>[0] = {
        traceId,
        name: "completion",
        model: generation.model,
        metadata: {
          latencyMs: generation.latencyMs,
          status: generation.status,
          errorCode: generation.errorCode,
        },
        level: generation.status === "error" ? "ERROR" : "DEFAULT",
      };

      // Only include usage if we have token data
      if (generation.tokensIn != null || generation.tokensOut != null) {
        generationParams.usage = {
          promptTokens: generation.tokensIn ?? null,
          completionTokens: generation.tokensOut ?? null,
        };
      }

      // Pass actual provider cost to Langfuse (overrides auto-calculated estimates)
      if (generation.providerCostUsd != null) {
        generationParams.costDetails = { total: generation.providerCostUsd };
      }

      // Only include statusMessage on error
      if (generation.status === "error") {
        generationParams.statusMessage = `Error: ${generation.errorCode ?? "unknown"}`;
      }

      this.langfuse.generation(generationParams);
    } catch (error) {
      // Graceful degradation - log and continue
      // biome-ignore lint/suspicious/noConsole: Langfuse errors should be visible
      console.error("[LangfuseAdapter] recordGeneration failed:", error);
    }
  }

  /**
   * Flush pending traces to Langfuse.
   * Only call if trace was created; never await on request path.
   */
  async flush(): Promise<void> {
    if (this.activeTraces.size === 0) {
      return;
    }

    try {
      await this.langfuse.flushAsync();
      this.activeTraces.clear();
    } catch (error) {
      // Graceful degradation - log and continue
      // biome-ignore lint/suspicious/noConsole: Langfuse errors should be visible
      console.error("[LangfuseAdapter] flush failed:", error);
      // Clear anyway to prevent memory leak
      this.activeTraces.clear();
    }
  }
}
