// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/graphs/poet/server`
 * Purpose: LangGraph dev server entrypoint for poet graph.
 * Scope: Top-level await for LLM init, delegates to shared helper. NOT for production.
 * Invariants:
 *   - ENTRYPOINT_IS_THIN: Only LLM init + helper call
 *   - LANGGRAPH_JSON_POINTS_TO_SERVER_ONLY: Referenced by langgraph.json
 * Side-effects: process.env
 * Links: GRAPH_EXECUTION.md
 * @internal
 */

import { initChatModel } from "langchain/chat_models/universal";

import { createServerEntrypoint } from "../../runtime/core/server-entrypoint";
import { createPoetGraph, POET_GRAPH_NAME } from "./graph";

// biome-ignore lint/style/noProcessEnv: Dev-only entrypoint
const baseURL = process.env.LITELLM_BASE_URL ?? "http://localhost:4000";
// biome-ignore lint/style/noProcessEnv: Dev-only entrypoint
const apiKey = process.env.LITELLM_MASTER_KEY ?? "dev-key";

const llm = await initChatModel(undefined, {
  configurableFields: ["model"],
  modelProvider: "openai",
  configuration: { baseURL },
  apiKey,
});

export const poet = createServerEntrypoint(POET_GRAPH_NAME, createPoetGraph, {
  llm,
});
