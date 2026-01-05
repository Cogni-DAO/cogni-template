// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/completion-unit-llm`
 * Purpose: LangChain BaseChatModel wrapper that routes LLM calls through injected CompletionFn.
 * Scope: Enables billing/streaming integration via executeCompletionUnit pattern. Does not call LLM providers directly.
 * Invariants:
 *   - NO_DIRECT_MODEL_CALLS: All LLM calls go through injected CompletionFn
 *   - NO_AWAIT_IN_TOKEN_PATH: tokenSink.push() is synchronous
 *   - Token streaming via tokenSink injection in _generate()
 * Side-effects: none (effects via injected deps)
 * Links: LANGGRAPH_AI.md, GRAPH_EXECUTION.md
 * @public
 */

import type { AiEvent } from "@cogni/ai-core";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import type { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";

import { fromBaseMessage, type Message } from "./message-converters";

/**
 * Completion function signature injected from adapter.
 * Per GRAPH_LLM_VIA_COMPLETION: graph calls this, not LLM SDK directly.
 */
export type CompletionFn = (params: {
  messages: Message[];
  model: string;
  tools?: unknown[];
  abortSignal?: AbortSignal;
}) => {
  /** Stream of AiEvents (text_delta, usage_report) */
  stream: AsyncIterable<AiEvent>;
  /** Final result with assembled response */
  final: Promise<CompletionResult>;
};

/**
 * Result from completion function.
 */
export interface CompletionResult {
  readonly ok: boolean;
  readonly content?: string;
  readonly toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  readonly usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  readonly finishReason?: string;
  readonly error?: string;
}

/**
 * Token sink for synchronous event pushing.
 * Per NO_AWAIT_IN_TOKEN_PATH: push() must be sync.
 */
export interface TokenSink {
  push: (event: AiEvent) => void;
}

/**
 * LangChain BaseChatModel that routes through injected CompletionFn.
 *
 * This wrapper enables:
 * - Billing integration via adapter's executeCompletionUnit
 * - Token streaming to queue via tokenSink
 * - Usage tracking across multi-step graphs
 *
 * Note: _streamResponseChunks() is NOT used when using createReactAgent
 * (which uses invoke() internally). Token streaming is achieved via
 * tokenSink injection in _generate().
 */
export class CompletionUnitLLM extends BaseChatModel {
  private completionFn: CompletionFn;
  private modelId: string;
  private tokenSink?: TokenSink;
  private collectedUsage: {
    promptTokens: number;
    completionTokens: number;
  } = { promptTokens: 0, completionTokens: 0 };

  static lc_name(): string {
    return "CompletionUnitLLM";
  }

  constructor(
    completionFn: CompletionFn,
    modelId: string,
    tokenSink?: TokenSink
  ) {
    super({});
    this.completionFn = completionFn;
    this.modelId = modelId;
    this.tokenSink = tokenSink;
  }

  _llmType(): string {
    return "completion-unit-llm";
  }

  /**
   * Generate a response from the LLM.
   * Routes through injected CompletionFn for billing/streaming.
   */
  async _generate(
    messages: BaseMessage[],
    _options?: BaseChatModelCallOptions
  ): Promise<ChatResult> {
    // Convert LangChain messages to app format
    const appMessages = messages.map(fromBaseMessage);

    // Call completion function
    const { stream, final } = this.completionFn({
      messages: appMessages,
      model: this.modelId,
      // Tools are handled by LangGraph, not passed here
    });

    // Drain stream, pushing tokens to sink (SYNC!)
    for await (const event of stream) {
      if (this.tokenSink) {
        // Push is synchronous per NO_AWAIT_IN_TOKEN_PATH
        this.tokenSink.push(event);
      }
    }

    // Await final result
    const result = await final;

    if (!result.ok) {
      throw new Error(result.error ?? "Completion failed");
    }

    // Accumulate usage
    if (result.usage) {
      this.collectedUsage.promptTokens += result.usage.promptTokens;
      this.collectedUsage.completionTokens += result.usage.completionTokens;
    }

    // Build AIMessage from result
    const aiMessage = new AIMessage({
      content: result.content ?? "",
      tool_calls: result.toolCalls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        args: JSON.parse(tc.arguments) as Record<string, unknown>,
        type: "tool_call" as const,
      })),
    });

    return {
      generations: [
        {
          text: result.content ?? "",
          message: aiMessage,
          generationInfo: {
            finishReason: result.finishReason,
          },
        },
      ],
      llmOutput: {
        tokenUsage: result.usage,
      },
    };
  }

  /**
   * Get accumulated usage across all LLM calls.
   * Used for final usage_report emission.
   */
  getCollectedUsage(): { promptTokens: number; completionTokens: number } {
    return { ...this.collectedUsage };
  }

  /**
   * Reset collected usage (for testing).
   */
  resetUsage(): void {
    this.collectedUsage = { promptTokens: 0, completionTokens: 0 };
  }

  /**
   * Required by BaseChatModel. Not used for streaming in our pattern.
   * We stream via tokenSink in _generate() instead.
   */
  // biome-ignore lint/correctness/useYield: Framework override - throws intentionally without yielding
  async *_streamResponseChunks(
    _messages: BaseMessage[],
    _options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    throw new Error(
      "Streaming via _streamResponseChunks not supported. Use tokenSink pattern."
    );
  }

  /**
   * Bind tools to this model instance.
   * Required by LangGraph for tool-using agents.
   * Note: Tools are handled by LangGraph agent, not passed to completion.
   */
  bindTools(
    _tools: unknown[],
    _kwargs?: Partial<BaseChatModelCallOptions>
  ): this {
    // Tools are handled by LangGraph agent, not passed to completion
    return this;
  }
}
