// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/inproc/generic-runner`
 * Purpose: Generic graph runner that accepts a graph factory.
 * Scope: Creates queue, wires dependencies, executes graph. Does NOT import from src/.
 * Invariants:
 *   - SINGLE_QUEUE_PER_RUN: Runner creates queue, passes emit to createToolExecFn
 *   - ASSISTANT_FINAL_REQUIRED: Emits exactly one assistant_final event on success
 *   - PACKAGES_NO_SRC_IMPORTS: No imports from src/**
 * Side-effects: IO (executes graph, emits events)
 * Links: LANGGRAPH_AI.md, GRAPH_EXECUTION.md
 * @public
 */

import type { AiEvent } from "@cogni/ai-core";
import type { ToolContract } from "@cogni/ai-tools";
import type { BaseMessage } from "@langchain/core/messages";

import { AsyncQueue } from "../runtime/async-queue";
import { CompletionUnitLLM } from "../runtime/completion-unit-llm";
import { toLangChainTools } from "../runtime/langchain-tools";
import { toBaseMessage } from "../runtime/message-converters";

import type {
  CompiledGraph,
  CompletionFn,
  CreateGraphFn,
  GraphResult,
  InProcGraphRequest,
  ToolExecFn,
} from "./types";

/**
 * Options for generic graph runner.
 * Similar to InProcRunnerOptions but uses CreateGraphFn instead of toolContracts.
 */
export interface GenericRunnerOptions<TTool = unknown> {
  /** Per-LLM-call completion function */
  readonly completionFn: CompletionFn<TTool>;

  /** Factory that receives emit callback and returns ToolExecFn */
  readonly createToolExecFn: (emit: (e: AiEvent) => void) => ToolExecFn;

  /** Graph factory function (from catalog entry) */
  readonly graphFactory: CreateGraphFn;

  /** Tool contracts for LangChain wrapping */
  readonly toolContracts: ReadonlyArray<
    ToolContract<string, unknown, unknown, unknown>
  >;

  /** Graph execution request */
  readonly request: InProcGraphRequest;
}

/**
 * Extract text content from final assistant message.
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
 * Create generic graph runner.
 *
 * Unlike createInProcChatRunner which is hardcoded to chat graph,
 * this accepts a graphFactory parameter for any graph type.
 *
 * @param opts - Runner options with graph factory
 * @returns { stream, final } - AsyncIterable of events and Promise of result
 */
export function createGenericGraphRunner<TTool = unknown>(
  opts: GenericRunnerOptions<TTool>
): {
  stream: AsyncIterable<AiEvent>;
  final: Promise<GraphResult>;
} {
  const {
    completionFn,
    createToolExecFn,
    graphFactory,
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

  // Create LLM with completion function
  const llm = new CompletionUnitLLM(
    completionFn as CompletionFn<unknown>,
    request.model,
    tokenSink
  );

  // Create LangChain tools
  const tools = toLangChainTools({
    contracts: toolContracts,
    exec: toolExecFn,
  });

  // Create graph using factory
  const graph: CompiledGraph = graphFactory({ llm, tools });

  const final = (async (): Promise<GraphResult> => {
    try {
      const messages = request.messages.map(toBaseMessage);
      const result = await graph.invoke(
        { messages },
        { signal: request.abortSignal }
      );

      const assistantContent = extractAssistantContent(result.messages);
      const usage = llm.getCollectedUsage();

      // ASSISTANT_FINAL_REQUIRED: exactly one per run
      emit({ type: "assistant_final", content: assistantContent });
      emit({ type: "done" });

      return { ok: true, usage, finishReason: "stop" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const isAbort = error instanceof Error && error.name === "AbortError";

      emit({ type: "error", error: isAbort ? "aborted" : message });

      return { ok: false, error: isAbort ? "aborted" : message };
    } finally {
      queue.close();
    }
  })();

  return { stream: queue, final };
}
