// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/research/graph`
 * Purpose: Hierarchical research graph with supervisor → researcher subgraph architecture.
 * Scope: Creates multi-level StateGraph with nested subgraphs. Does NOT execute graphs or read env.
 * Invariants:
 *   - PURE_FACTORY: No side effects, no env reads
 *   - HIERARCHICAL_GRAPHS: Main graph → supervisor subgraph → researcher subgraph
 *   - STRUCTURED_OUTPUT_ROUTING: Supervisor uses tool-like structured outputs to delegate
 *   - TYPE_TRANSPARENT_RETURN: No explicit return type for CLI schema extraction
 * Side-effects: none
 * Links: LANGGRAPH_AI.md, open-deep-research reference
 * @public
 */

import type { LanguageModelLike } from "@langchain/core/language_models/base";
import {
  AIMessage,
  type BaseMessage,
  type BaseMessageLike,
  coerceMessageLikeToMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";

import type { CreateReactAgentGraphOptions } from "../types";
import {
  COMPRESSION_SYSTEM_PROMPT,
  COMPRESSION_TRIGGER_MESSAGE,
  FINAL_REPORT_PROMPT,
  MAX_CONCURRENT_RESEARCH_UNITS,
  MAX_RESEARCHER_TOOL_CALLS,
  MAX_SUPERVISOR_ITERATIONS,
  RESEARCH_BRIEF_PROMPT,
  RESEARCHER_SYSTEM_PROMPT,
  SUPERVISOR_SYSTEM_PROMPT,
} from "./prompts";
import {
  type ResearcherState,
  ResearcherStateAnnotation,
  type ResearchState,
  ResearchStateAnnotation,
  type SupervisorState,
  SupervisorStateAnnotation,
} from "./state";

/**
 * Graph name constant for routing.
 */
export const RESEARCH_GRAPH_NAME = "research" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Structured Output Schemas (for supervisor routing)
// ─────────────────────────────────────────────────────────────────────────────

const ConductResearchSchema = z.object({
  researchTopic: z
    .string()
    .describe(
      "The topic to research. Should be detailed (at least a paragraph) with specific aspects to investigate."
    ),
});

const ResearchCompleteSchema = z.object({
  summary: z
    .string()
    .optional()
    .describe("Optional summary of why research is complete"),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function getTodayString(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function formatPrompt(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

/**
 * Extract text content from messages for notes.
 */
function getNotesFromMessages(
  messages: readonly { content: unknown }[]
): string[] {
  return messages
    .filter((m) => m.content && typeof m.content === "string")
    .map((m) => m.content as string);
}

/**
 * Coerce state messages to proper BaseMessage instances.
 * Messages may lose their prototype when passing through LangGraph state serialization.
 */
function coerceMessages(
  messages: readonly BaseMessageLike[] | undefined
): BaseMessage[] {
  return (messages ?? []).map((m) => coerceMessageLikeToMessage(m));
}

/**
 * Get message type using public accessor with fallback.
 */
function getMessageType(msg: BaseMessage): string {
  return msg.getType?.() ?? (msg as unknown as { type?: string }).type ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Researcher Subgraph
// ─────────────────────────────────────────────────────────────────────────────

interface CreateResearcherSubgraphOptions {
  llm: LanguageModelLike;
  tools: readonly StructuredToolInterface[];
}

function createResearcherSubgraph(opts: CreateResearcherSubgraphOptions) {
  const { llm, tools } = opts;
  const toolNode = new ToolNode([...tools]);
  const toolNames = new Set(tools.map((t) => t.name));

  // Researcher node: generates response with tool calls
  async function researcher(state: ResearcherState, config: RunnableConfig) {
    const systemPrompt = formatPrompt(RESEARCHER_SYSTEM_PROMPT, {
      date: getTodayString(),
    });

    const messages = [
      new SystemMessage(systemPrompt),
      ...state.researcherMessages,
    ];

    // Bind tools so the researcher can make tool calls (e.g., web search)
    // biome-ignore lint/suspicious/noExplicitAny: LangGraph LLM invoke requires dynamic typing
    const llmWithTools = (llm as any).bindTools([...tools]);
    const response = (await llmWithTools.invoke(messages, config)) as AIMessage;

    return {
      researcherMessages: [response],
      toolCallIterations: (state.toolCallIterations ?? 0) + 1,
    };
  }

  // Researcher tools node: executes tool calls
  async function researcherTools(
    state: ResearcherState,
    config: RunnableConfig
  ) {
    const lastMessage =
      state.researcherMessages[state.researcherMessages.length - 1];

    // Type guard: check if message is AIMessage with tool_calls
    if (
      !(lastMessage instanceof AIMessage) ||
      !lastMessage.tool_calls?.length
    ) {
      return { researcherMessages: [] };
    }

    // Filter to only allowed tools
    const validToolCalls = lastMessage.tool_calls.filter((tc) =>
      toolNames.has(tc.name)
    );

    if (validToolCalls.length === 0) {
      return { researcherMessages: [] };
    }

    // Execute tools via ToolNode (pass config for tool execution context)
    const toolResult = await toolNode.invoke(
      {
        messages: [lastMessage],
      },
      config
    );

    return {
      researcherMessages: toolResult.messages ?? [],
    };
  }

  // Compression node: synthesizes findings
  async function compressResearch(
    state: ResearcherState,
    config: RunnableConfig
  ) {
    const systemPrompt = formatPrompt(COMPRESSION_SYSTEM_PROMPT, {
      date: getTodayString(),
    });

    // NOTE: Spoofing a HumanMessage to trigger compression mode shift.
    // Not sure if this is good form that we want to duplicate, but this pattern
    // is in the open-deep-research OSS implementation from LangGraph:
    // https://github.com/langchain-ai/open_deep_research/blob/main/src/open_deep_research/deep_researcher.py
    const messages = [
      new SystemMessage(systemPrompt),
      ...state.researcherMessages,
      new HumanMessage(COMPRESSION_TRIGGER_MESSAGE),
    ];

    // biome-ignore lint/suspicious/noExplicitAny: LangGraph LLM invoke requires dynamic typing
    const response = (await (llm as any).invoke(messages, config)) as AIMessage;
    const content =
      typeof response.content === "string" ? response.content : "";

    // Collect raw notes from tool messages
    const rawNotes = getNotesFromMessages(state.researcherMessages);

    return {
      compressedResearch: content,
      rawNotes,
    };
  }

  // Routing: continue research or compress
  function routeResearcher(state: ResearcherState): string {
    const lastMessage =
      state.researcherMessages[state.researcherMessages.length - 1];
    const hasToolCalls =
      lastMessage instanceof AIMessage &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0;
    const exceededIterations =
      (state.toolCallIterations ?? 0) >= MAX_RESEARCHER_TOOL_CALLS;

    if (!hasToolCalls || exceededIterations) {
      return "compress_research";
    }
    return "researcher_tools";
  }

  // Build the researcher subgraph
  // Note: Type assertions needed for LangGraph's strict builder typing
  const builder = new StateGraph(ResearcherStateAnnotation)
    .addNode("researcher", researcher)
    .addNode("researcher_tools", researcherTools)
    .addNode("compress_research", compressResearch)
    .addEdge("__start__", "researcher")
    .addConditionalEdges("researcher", routeResearcher)
    .addEdge("researcher_tools", "researcher")
    .addEdge("compress_research", "__end__");

  return builder.compile();
}

// ─────────────────────────────────────────────────────────────────────────────
// Supervisor Subgraph
// ─────────────────────────────────────────────────────────────────────────────

interface CreateSupervisorSubgraphOptions {
  llm: LanguageModelLike;
  tools: readonly StructuredToolInterface[];
}

function createSupervisorSubgraph(opts: CreateSupervisorSubgraphOptions) {
  const { llm, tools } = opts;

  // Pre-compile the researcher subgraph
  const researcherSubgraph = createResearcherSubgraph({ llm, tools });

  // Create supervisor tools as structured outputs
  const conductResearchTool = {
    name: "conduct_research",
    description:
      "Delegate a research task to a researcher. Provide a detailed topic description.",
    schema: ConductResearchSchema,
  };

  const researchCompleteTool = {
    name: "research_complete",
    description:
      "Signal that research is complete and ready for report generation.",
    schema: ResearchCompleteSchema,
  };

  // Supervisor node: decides what to research
  async function supervisor(state: SupervisorState, config: RunnableConfig) {
    const systemPrompt = formatPrompt(SUPERVISOR_SYSTEM_PROMPT, {
      date: getTodayString(),
    });

    // Bind tools to LLM for structured output
    // biome-ignore lint/suspicious/noExplicitAny: LangGraph requires dynamic bindTools
    const llmWithTools = (llm as any).bindTools([
      conductResearchTool,
      researchCompleteTool,
    ]);

    const messages =
      state.supervisorMessages.length > 0
        ? state.supervisorMessages
        : [
            new SystemMessage(systemPrompt),
            new HumanMessage(state.researchBrief),
          ];

    const response = (await llmWithTools.invoke(messages, config)) as AIMessage;

    return {
      supervisorMessages: [response],
      researchIterations: (state.researchIterations ?? 0) + 1,
    };
  }

  // Supervisor tools node: handles tool calls (delegates to researchers)
  async function supervisorTools(
    state: SupervisorState,
    config: RunnableConfig
  ) {
    const lastMessage =
      state.supervisorMessages[state.supervisorMessages.length - 1];

    // Type guard for AIMessage with tool_calls
    if (
      !(lastMessage instanceof AIMessage) ||
      !lastMessage.tool_calls?.length
    ) {
      return { supervisorMessages: [], notes: [] };
    }

    const toolCalls = lastMessage.tool_calls;

    // Check for research_complete
    const researchCompleteCall = toolCalls.find(
      (tc) => tc.name === "research_complete"
    );
    if (researchCompleteCall) {
      // Signal completion by returning notes and ending
      return {
        notes: getNotesFromMessages(state.supervisorMessages),
        supervisorMessages: [],
      };
    }

    // Handle conduct_research calls
    const conductResearchCalls = toolCalls.filter(
      (tc) => tc.name === "conduct_research"
    );

    if (conductResearchCalls.length === 0) {
      return { supervisorMessages: [], notes: [] };
    }

    // Limit concurrent research
    const allowedCalls = conductResearchCalls.slice(
      0,
      MAX_CONCURRENT_RESEARCH_UNITS
    );

    // Execute research tasks in parallel (pass config for LLM invocation)
    const researchPromises = allowedCalls.map(async (tc) => {
      const topic = (tc.args as { researchTopic?: string }).researchTopic ?? "";

      const result = await researcherSubgraph.invoke(
        {
          researcherMessages: [new HumanMessage(topic)],
          researchTopic: topic,
          toolCallIterations: 0,
          compressedResearch: "",
          rawNotes: [],
        },
        config
      );

      return {
        toolCallId: tc.id,
        content:
          result.compressedResearch ||
          "Research completed but no summary generated.",
        rawNotes: result.rawNotes ?? [],
      };
    });

    const results = await Promise.all(researchPromises);

    // Create tool messages with results
    const toolMessages = results.map((r) => ({
      role: "tool" as const,
      content: r.content,
      tool_call_id: r.toolCallId,
      name: "conduct_research",
    }));

    // Aggregate raw notes
    const allRawNotes = results.flatMap((r) => r.rawNotes);

    return {
      supervisorMessages: toolMessages,
      rawNotes: allRawNotes.length > 0 ? allRawNotes : undefined,
    };
  }

  // Routing: decide whether to process tools
  function routeSupervisor(state: SupervisorState): string {
    const lastMessage =
      state.supervisorMessages[state.supervisorMessages.length - 1];

    // No tool calls or not an AIMessage → end
    if (
      !(lastMessage instanceof AIMessage) ||
      !lastMessage.tool_calls?.length
    ) {
      return "__end__";
    }

    // Always process tool calls via supervisor_tools
    // (including research_complete, which extracts notes)
    return "supervisor_tools";
  }

  // Routing after tools: continue loop or end
  function routeAfterTools(state: SupervisorState): string {
    // If notes were populated (research_complete was processed), end
    if (state.notes && state.notes.length > 0) {
      return "__end__";
    }

    // Check iteration limit
    if ((state.researchIterations ?? 0) >= MAX_SUPERVISOR_ITERATIONS) {
      return "__end__";
    }

    return "supervisor";
  }

  // Build the supervisor subgraph
  const builder = new StateGraph(SupervisorStateAnnotation)
    .addNode("supervisor", supervisor)
    .addNode("supervisor_tools", supervisorTools)
    .addEdge("__start__", "supervisor")
    .addConditionalEdges("supervisor", routeSupervisor)
    .addConditionalEdges("supervisor_tools", routeAfterTools);

  return builder.compile();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Research Graph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a hierarchical research graph.
 *
 * Architecture:
 * ```
 * START → write_research_brief → research_supervisor → final_report → END
 *                                       │
 *                                       ├── supervisor ←→ supervisor_tools
 *                                       │                      │
 *                                       │                      ▼
 *                                       │              researcher_subgraph
 *                                       │              (researcher ←→ tools → compress)
 *                                       │
 *                                       └── returns notes
 * ```
 *
 * NOTE: Return type is intentionally NOT annotated to preserve the concrete
 * CompiledStateGraph type for LangGraph CLI schema extraction.
 *
 * @param opts - Options with LLM and tools
 * @returns Compiled LangGraph ready for invoke()
 */
export function createResearchGraph(opts: CreateReactAgentGraphOptions) {
  const { llm, tools } = opts;

  // Pre-compile the supervisor subgraph
  const supervisorSubgraph = createSupervisorSubgraph({ llm, tools });

  // Node: Transform user question into research brief
  async function writeResearchBrief(
    state: ResearchState,
    config: RunnableConfig
  ) {
    const messages = coerceMessages(state.messages);
    const userMessages = messages.filter((m) => getMessageType(m) === "human");
    const lastUserMessage = userMessages[userMessages.length - 1];
    const userQuestion =
      lastUserMessage && typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : "";

    const prompt = formatPrompt(RESEARCH_BRIEF_PROMPT, {
      userQuestion,
      date: getTodayString(),
    });

    // biome-ignore lint/suspicious/noExplicitAny: LangGraph LLM invoke requires dynamic typing
    const response = (await (llm as any).invoke(
      [new HumanMessage(prompt)],
      config
    )) as AIMessage;

    const researchBrief =
      typeof response.content === "string" ? response.content : "";

    return {
      researchBrief,
      supervisorMessages: [
        new SystemMessage(
          formatPrompt(SUPERVISOR_SYSTEM_PROMPT, { date: getTodayString() })
        ),
        new HumanMessage(researchBrief),
      ],
    };
  }

  // Node: Execute supervisor subgraph
  async function researchSupervisor(
    state: ResearchState,
    config: RunnableConfig
  ) {
    const result = await supervisorSubgraph.invoke(
      {
        supervisorMessages: state.supervisorMessages,
        researchBrief: state.researchBrief,
        notes: [],
        rawNotes: [],
        researchIterations: 0,
      },
      config
    );

    return {
      notes: result.notes ?? [],
      rawNotes: result.rawNotes ?? [],
    };
  }

  // Node: Generate final report
  async function finalReport(state: ResearchState, config: RunnableConfig) {
    const messages = coerceMessages(state.messages);
    const userMessages = messages.filter((m) => getMessageType(m) === "human");
    const lastUserMessage = userMessages[userMessages.length - 1];
    const userQuestion =
      lastUserMessage && typeof lastUserMessage.content === "string"
        ? lastUserMessage.content
        : "";

    const findings = (state.notes ?? []).join("\n\n---\n\n");

    const prompt = formatPrompt(FINAL_REPORT_PROMPT, {
      researchBrief: state.researchBrief ?? "",
      userQuestion,
      findings,
      date: getTodayString(),
    });

    // biome-ignore lint/suspicious/noExplicitAny: LangGraph LLM invoke requires dynamic typing
    const response = (await (llm as any).invoke(
      [new HumanMessage(prompt)],
      config
    )) as AIMessage;

    const report = typeof response.content === "string" ? response.content : "";

    return {
      finalReport: report,
      messages: [new AIMessage(report)],
    };
  }

  // Build the main graph
  const builder = new StateGraph(ResearchStateAnnotation)
    .addNode("write_research_brief", writeResearchBrief)
    .addNode("research_supervisor", researchSupervisor)
    .addNode("final_report", finalReport)
    .addEdge("__start__", "write_research_brief")
    .addEdge("write_research_brief", "research_supervisor")
    .addEdge("research_supervisor", "final_report")
    .addEdge("final_report", "__end__");

  return builder.compile();
}
