// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/inproc/runner`
 * Purpose: InProc graph execution runner for Next.js server runtime.
 * Scope: Creates queue, wires dependencies, executes graph via ALS context, emits events. Does NOT import from src/.
 * Invariants:
 *   - SINGLE_QUEUE_PER_RUN: Runner creates queue, passes emit to createToolExecFn
 *   - RUNTIME_CONTEXT_VIA_ALS: Sets up ALS context before graph invocation
 *   - ASSISTANT_FINAL_REQUIRED: Emits exactly one assistant_final event on success; none on error
 *   - NO_AWAIT_IN_TOKEN_PATH: tokenSink.push() is synchronous
 *   - RESULT_REFLECTS_OUTCOME: final.ok matches stream success/failure
 *   - ERROR_NORMALIZATION_ONCE: Catch block uses normalizeErrorToExecutionCode()
 * Side-effects: IO (executes graph, emits events)
 * Links: LANGGRAPH_AI.md, ERROR_HANDLING_ARCHITECTURE.md
 * @public
 */

import { type AiEvent, normalizeErrorToExecutionCode } from "@cogni/ai-core";
import type { BaseMessage } from "@langchain/core/messages";

import { AsyncQueue } from "../runtime/async-queue";
import {
  type CompletionFn,
  CompletionUnitLLM,
} from "../runtime/completion-unit-llm";
import { runWithInProcContext } from "../runtime/inproc-runtime";
import { toLangChainToolsServer } from "../runtime/langchain-tools";
import { toBaseMessage } from "../runtime/message-converters";

import type { GraphResult, InProcRunnerOptions } from "./types";

/**
 * Extract text content from final assistant message.
 * LangGraph returns messages array; last message is assistant response.
 */
function extractAssistantContent(messages: BaseMessage[]): string {
  if (messages.length === 0) return "";

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return "";

  if (typeof lastMessage.content === "string") {
    return lastMessage.content;
  }

  if (Array.isArray(lastMessage.content)) {
    return lastMessage.content
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" &&
          part !== null &&
          "type" in part &&
          part.type === "text"
      )
      .map((part) => part.text)
      .join("");
  }

  return "";
}

/**
 * Create InProc graph runner.
 *
 * Generic runner that accepts a graph factory from the catalog.
 * All LangChain logic is contained here — callers don't need LangChain imports.
 *
 * Per SINGLE_QUEUE_PER_RUN: Runner creates queue internally.
 * Per RUNTIME_CONTEXT_VIA_ALS: Sets up ALS before graph invocation.
 * Per ASSISTANT_FINAL_REQUIRED: Emits exactly one assistant_final event.
 *
 * @param opts - Runner options including graph factory
 * @returns { stream, final } - AsyncIterable of events and Promise of result
 */
export function createInProcGraphRunner<TTool = unknown>(
  opts: InProcRunnerOptions<TTool>
): {
  stream: AsyncIterable<AiEvent>;
  final: Promise<GraphResult>;
} {
  const {
    createGraph,
    completionFn,
    createToolExecFn,
    toolContracts,
    request,
  } = opts;

  // SINGLE_QUEUE_PER_RUN: Runner creates queue, all events flow here
  const queue = new AsyncQueue<AiEvent>();

  const emit = (e: AiEvent): void => {
    queue.push(e);
  };

  const tokenSink = { push: emit };
  const toolExecFn = createToolExecFn(emit);

  // Create no-arg CompletionUnitLLM (reads from ALS + configurable at invoke time)
  const llm = new CompletionUnitLLM();

  // Use toLangChainToolsServer since runner provides toolExecFn directly (not from ALS)
  const tools = toLangChainToolsServer({
    contracts: toolContracts,
    toolExecFn,
  });

  // Use factory from catalog instead of hardcoded graph
  const graph = createGraph({ llm, tools });

  const final = (async (): Promise<GraphResult> => {
    try {
      const messages = request.messages.map(toBaseMessage);

      // Set up ALS context and invoke graph
      // Per RUNTIME_CONTEXT_VIA_ALS: CompletionUnitLLM reads model/completionFn/tokenSink from ALS
      // Note: model is in ALS because LangChain strips configurable before _generate()
      const result = await runWithInProcContext(
        {
          model: request.configurable.model,
          completionFn: completionFn as CompletionFn<unknown>,
          tokenSink,
          toolExecFn,
        },
        () =>
          graph.invoke(
            { messages },
            {
              signal: request.abortSignal,
              configurable: request.configurable,
            }
          )
      );

      const assistantContent = extractAssistantContent(result.messages);
      const usage = llm.getCollectedUsage();

      // ASSISTANT_FINAL_REQUIRED: exactly one per run
      emit({ type: "assistant_final", content: assistantContent });
      emit({ type: "done" });

      // Omit usage when undefined (never default to zeros)
      return {
        ok: true,
        finishReason: "stop",
        content: assistantContent,
        ...(usage !== undefined && { usage }),
      };
    } catch (error) {
      // Normalize error using duck-typed LlmError detection (kind/status properties)
      // Per ERROR_NORMALIZATION_ONCE: normalize at catch boundary
      const code = normalizeErrorToExecutionCode(error);

      // Per ERROR_NORMALIZATION: emit code only, not message
      emit({ type: "error", error: code });
      // Per GRAPH_FINALIZATION_ONCE: always emit done as final event
      emit({ type: "done" });

      return { ok: false, error: code };
    } finally {
      queue.close();
    }
  })();

  return { stream: queue, final };
}
