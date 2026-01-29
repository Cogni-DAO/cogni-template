// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/completion-unit-llm`
 * Purpose: LangChain BaseChatModel wrapper that routes LLM calls through ALS-provided CompletionFn.
 * Scope: Enables billing/streaming integration via executeCompletionUnit pattern. Does not call LLM providers directly.
 * Invariants:
 *   - NO_CONSTRUCTOR_ARGS: No completionFn/tokenSink/model in constructor; read from ALS + configurable
 *   - NO_DIRECT_MODEL_CALLS: All LLM calls go through ALS-provided CompletionFn
 *   - NO_AWAIT_IN_TOKEN_PATH: tokenSink.push() is synchronous
 *   - THROWS_AI_EXECUTION_ERROR: On completion failure, throws AiExecutionError with structured code
 *   - THROWS_FAST_IF_MISSING: Throws immediately if ALS context or model missing
 * Side-effects: none (effects via ALS-injected deps)
 * Links: LANGGRAPH_AI.md, ERROR_HANDLING_ARCHITECTURE.md
 * @public
 */

import {
  type AiEvent,
  AiExecutionError,
  isAiExecutionErrorCode,
} from "@cogni/ai-core";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import type { ChatGenerationChunk, ChatResult } from "@langchain/core/outputs";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";

import { getInProcRuntime } from "./inproc-runtime";
import { fromBaseMessage, type Message } from "./message-converters";

/** OpenAI tool format - matches LlmToolDefinition in ports */
type OpenAIToolDef = ReturnType<typeof convertToOpenAITool>;

/**
 * Completion function signature obtained from ALS.
 * Per GRAPH_LLM_VIA_COMPLETION: graph calls this, not LLM SDK directly.
 *
 * Generic TTool allows src/ to use LlmToolDefinition while package defaults to unknown.
 */
export type CompletionFn<TTool = unknown> = (params: {
  messages: Message[];
  model: string;
  tools?: readonly TTool[];
  abortSignal?: AbortSignal;
}) => {
  /** Stream of AiEvents (text_delta, usage_report) */
  stream: AsyncIterable<AiEvent>;
  /** Final result with assembled response */
  final: Promise<CompletionResult>;
};

/**
 * Tool call in OpenAI format (matches LlmToolCall in ports).
 * Defined here to avoid src/ imports per PACKAGES_NO_SRC_IMPORTS.
 */
export interface ToolCall {
  readonly id: string;
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly arguments: string;
  };
}

/**
 * Result from completion function.
 */
export interface CompletionResult {
  readonly ok: boolean;
  readonly content?: string;
  /** Tool calls in OpenAI format (nested function.name/arguments) */
  readonly toolCalls?: ToolCall[];
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
 * Internal config for CompletionUnitLLM.
 * Only used by bindTools() to pass tools to new instance.
 * @internal
 */
interface CompletionUnitLLMConfig {
  readonly boundTools?: OpenAIToolDef[];
}

/**
 * LangChain BaseChatModel that routes through ALS-provided CompletionFn.
 *
 * This wrapper enables:
 * - Billing integration via adapter's executeCompletionUnit
 * - Token streaming to queue via tokenSink from ALS
 * - Usage tracking across multi-step graphs
 *
 * Per NO_CONSTRUCTOR_ARGS: No completionFn/tokenSink/model in constructor.
 * - completionFn and tokenSink: read from ALS via getInProcRuntime()
 * - model: read from config.configurable.model at invoke time
 *
 * Note: _streamResponseChunks() is NOT used when using createReactAgent
 * (which uses invoke() internally). Token streaming is achieved via
 * tokenSink from ALS in _generate().
 */
export class CompletionUnitLLM extends BaseChatModel {
  /** Bound tools in OpenAI format, set via bindTools() */
  private readonly _boundTools?: OpenAIToolDef[];

  /** Accumulated usage across all LLM calls. Undefined until first call reports usage. */
  private _collectedUsage:
    | { promptTokens: number; completionTokens: number }
    | undefined = undefined;

  static lc_name(): string {
    return "CompletionUnitLLM";
  }

  /**
   * Create a CompletionUnitLLM instance.
   *
   * Per NO_CONSTRUCTOR_ARGS: No completionFn/tokenSink/model params.
   * These are read from ALS + configurable at invoke time.
   *
   * @param config - Internal config (only used by bindTools)
   */
  constructor(config?: CompletionUnitLLMConfig) {
    super({});
    this._boundTools = config?.boundTools;
  }

  _llmType(): string {
    return "completion-unit-llm";
  }

  /**
   * Generate a response from the LLM.
   *
   * Reads runtime deps from ALS (completionFn, tokenSink) and model from configurable.
   * Per THROWS_FAST_IF_MISSING: throws immediately if ALS or model missing.
   * Per CANCEL_PROPAGATION: passes abort signal to completionFn.
   */
  async _generate(
    messages: BaseMessage[],
    options?: BaseChatModelCallOptions
  ): Promise<ChatResult> {
    // Read runtime from ALS (throws if missing per THROWS_FAST_IF_MISSING)
    // Note: model is in ALS because LangChain strips configurable before calling _generate
    const runtime = getInProcRuntime();
    const { model, completionFn, tokenSink } = runtime;

    // Convert LangChain messages to app format
    const appMessages = messages.map(fromBaseMessage);

    // Call completion function with abort signal per CANCEL_PROPAGATION
    // Per TOOLS_VIA_BINDTOOLS: pass bound tools to completionFn
    const { stream, final } = completionFn({
      messages: appMessages,
      model,
      abortSignal: options?.signal,
      ...(this._boundTools &&
        this._boundTools.length > 0 && { tools: this._boundTools }),
    });

    // CRITICAL: Register guard immediately to prevent unhandled rejection.
    // stream and final share the same underlying promise - if one rejects,
    // both do. Without this guard, final may reject before/independently of
    // stream iteration, causing unhandled rejection.
    const finalGuard = final.catch(() => undefined);

    // Drain stream, pushing tokens to sink (SYNC!)
    try {
      for await (const event of stream) {
        // Push is synchronous per NO_AWAIT_IN_TOKEN_PATH
        tokenSink.push(event);
      }
    } finally {
      // Ensure finalGuard is awaited even on error path
      await finalGuard;
    }

    // Await final result (success path)
    const result = await final;

    if (!result.ok) {
      // Throw AiExecutionError with structured code for proper normalization
      const code =
        result.error && isAiExecutionErrorCode(result.error)
          ? result.error
          : "internal";
      throw new AiExecutionError(code, `Completion failed: ${code}`);
    }

    // Accumulate usage (initialize on first call with usage)
    if (result.usage) {
      if (this._collectedUsage === undefined) {
        this._collectedUsage = { promptTokens: 0, completionTokens: 0 };
      }
      this._collectedUsage.promptTokens += result.usage.promptTokens;
      this._collectedUsage.completionTokens += result.usage.completionTokens;
    }

    // Build AIMessage from result
    // Invariant: tool calls must have function.name (provider contract)
    // Default empty arguments to "{}" to handle tools with no parameters
    const aiMessage = new AIMessage({
      content: result.content ?? "",
      tool_calls: result.toolCalls?.map((tc, i) => {
        if (!tc.function?.name) {
          throw new Error(
            `[CompletionUnitLLM] missing toolCall function.name at index ${i}`
          );
        }
        return {
          id: tc.id,
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments || "{}") as Record<
            string,
            unknown
          >,
          type: "tool_call" as const,
        };
      }),
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
   * Returns undefined if no calls reported usage.
   */
  getCollectedUsage():
    | { promptTokens: number; completionTokens: number }
    | undefined {
    return this._collectedUsage ? { ...this._collectedUsage } : undefined;
  }

  /**
   * Reset collected usage (for testing).
   */
  resetUsage(): void {
    this._collectedUsage = undefined;
  }

  /**
   * Required by BaseChatModel. Not used for streaming in our pattern.
   * We stream via tokenSink from ALS in _generate() instead.
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
   * Converts LangChain tools to OpenAI format and returns a new instance.
   * Per TOOLS_VIA_BINDTOOLS: bound tools are passed to completionFn in _generate().
   */
  bindTools(
    tools: unknown[],
    _kwargs?: Partial<BaseChatModelCallOptions>
  ): this {
    // Convert LangChain tools to OpenAI function-calling format
    const openAITools = tools.map((tool) =>
      convertToOpenAITool(tool as Parameters<typeof convertToOpenAITool>[0])
    );
    // Return new instance with tools bound (immutable pattern per LangChain convention)
    return new CompletionUnitLLM({ boundTools: openAITools }) as this;
  }
}
