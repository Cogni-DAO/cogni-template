// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/cogni/completion-adapter`
 * Purpose: Runnable-based adapter that routes LLM calls through Cogni's ALS-provided CompletionFn.
 * Scope: Enables billing/streaming integration via executeCompletionUnit pattern. Does not call LLM providers directly.
 * Invariants:
 *   - NO_MODEL_IN_ALS (#35): Model read from config.configurable.model, never ALS
 *   - MODEL_READ_FROM_CONFIGURABLE_AT_RUNNABLE_BOUNDARY (#37): Model resolved in invoke()
 *   - NO_DIRECT_MODEL_CALLS: All LLM calls go through ALS-provided CompletionFn
 *   - NO_AWAIT_IN_TOKEN_PATH: tokenSink.push() is synchronous
 *   - THROWS_AI_EXECUTION_ERROR: On completion failure, throws AiExecutionError with structured code
 *   - THROWS_FAST_IF_MISSING: Throws immediately if ALS context or model missing
 * Side-effects: none (effects via ALS-injected deps)
 * Links: LANGGRAPH_AI.md, ERROR_HANDLING_ARCHITECTURE.md, GRAPH_EXECUTION.md
 * @public
 */

import {
  type AiEvent,
  AiExecutionError,
  isAiExecutionErrorCode,
} from "@cogni/ai-core";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { Runnable } from "@langchain/core/runnables";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { fromBaseMessage, type Message } from "../core/message-converters";
import { getCogniExecContext } from "./exec-context";

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
 * Extended RunnableConfig with our configurable fields.
 * Model comes from configurable per #35/#37.
 */
interface CogniCompletionConfig extends RunnableConfig {
  configurable?: {
    model?: string;
    toolIds?: readonly string[];
    [key: string]: unknown;
  };
}

/**
 * Internal config for CogniCompletionAdapter.
 * Only used by bindTools() to pass tools to new instance.
 * @internal
 */
interface CogniCompletionAdapterConfig {
  readonly boundTools?: OpenAIToolDef[];
}

/**
 * Cogni completion adapter that routes LLM calls through ALS-provided CompletionFn.
 *
 * This adapter enables:
 * - Billing integration via Cogni's executeCompletionUnit
 * - Token streaming to queue via tokenSink from ALS
 * - Model selection via configurable (not ALS)
 *
 * Per #35 NO_MODEL_IN_ALS: model comes from config.configurable.model
 * Per #37 MODEL_READ_FROM_CONFIGURABLE_AT_RUNNABLE_BOUNDARY: resolved in invoke()
 *
 * Usage tracking is handled by the runner (per-run aggregation), not this class.
 */
export class CogniCompletionAdapter extends Runnable<BaseMessage[], AIMessage> {
  /** Bound tools in OpenAI format, set via bindTools() */
  private readonly _boundTools?: OpenAIToolDef[];

  lc_namespace = ["cogni", "langgraph"];

  static lc_name(): string {
    return "CogniCompletionAdapter";
  }

  /**
   * Returns model type identifier.
   * Required by LangGraph's _isBaseChatModel() check which looks for this method.
   * LangGraph uses duck-typing: "invoke" in model && "_modelType" in model
   */
  _modelType(): string {
    return "base_chat_model";
  }

  /**
   * Create a CogniCompletionAdapter instance.
   *
   * No completionFn/tokenSink/model params — these are read at invoke time:
   * - model: from config.configurable.model (per #35/#37)
   * - completionFn, tokenSink: from ALS via getCogniExecContext()
   *
   * @param config - Internal config (only used by bindTools)
   */
  constructor(config?: CogniCompletionAdapterConfig) {
    super({});
    this._boundTools = config?.boundTools;
  }

  /**
   * Invoke the LLM with messages.
   *
   * Reads model from config.configurable (per #35/#37) and
   * completionFn/tokenSink from ALS. Fails fast if either is missing.
   *
   * @param messages - Input messages
   * @param config - RunnableConfig with configurable.model
   * @returns AIMessage with response
   */
  async invoke(
    messages: BaseMessage[],
    config?: CogniCompletionConfig
  ): Promise<AIMessage> {
    // Read model from configurable (per #35/#37)
    const model = config?.configurable?.model;
    if (!model) {
      throw new Error(
        "[CogniCompletionAdapter] config.configurable.model is required. " +
          "Ensure graph is invoked with { configurable: { model: '...' } }."
      );
    }

    // Read context from ALS (throws if missing per THROWS_FAST_IF_MISSING)
    const context = getCogniExecContext();
    const { completionFn, tokenSink } = context;

    // Convert LangChain messages to app format
    const appMessages = messages.map(fromBaseMessage);

    // Call completion function with abort signal per CANCEL_PROPAGATION
    // Per TOOLS_VIA_BINDTOOLS: pass bound tools to completionFn
    const { stream, final } = completionFn({
      messages: appMessages,
      model,
      abortSignal: config?.signal,
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

    // Build AIMessage from result
    // Invariant: tool calls must have function.name (provider contract)
    // Default empty arguments to "{}" to handle tools with no parameters
    return new AIMessage({
      content: result.content ?? "",
      tool_calls: result.toolCalls?.map((tc, i) => {
        if (!tc.function?.name) {
          throw new Error(
            `[CogniCompletionAdapter] missing toolCall function.name at index ${i}`
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
  }

  /**
   * Bind tools to this adapter instance.
   * Converts LangChain tools to OpenAI format and returns a new instance.
   *
   * Per #35/#37: model is NOT captured here — always read from configurable in invoke().
   */
  bindTools(tools: unknown[]): CogniCompletionAdapter {
    // Convert LangChain tools to OpenAI function-calling format
    const openAITools = tools.map((tool) =>
      convertToOpenAITool(tool as Parameters<typeof convertToOpenAITool>[0])
    );
    // Return new instance with tools bound (immutable pattern per LangChain convention)
    // Model is NOT captured — always read from configurable at invoke time
    return new CogniCompletionAdapter({ boundTools: openAITools });
  }
}
