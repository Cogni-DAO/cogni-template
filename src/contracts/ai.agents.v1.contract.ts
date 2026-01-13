// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/ai.agents.v1.contract`
 * Purpose: Defines operation contract for listing available agents.
 * Scope: Provides Zod schema and types for agents list endpoint wire format. Does not implement business logic.
 * Invariants:
 *   - Contract remains stable; breaking changes require new version
 *   - All consumers use z.infer types
 *   - P0_AGENT_GRAPH_IDENTITY: agentId === graphId (one agent per graph)
 *   - LANGGRAPH_SERVER_ALIGNED: Field names match LangGraph Server assistant model
 * Side-effects: none
 * Notes: P0: agentId === graphId. P1+: agentId becomes stable, may reference multiple assistants per graph.
 *        For providerId='langgraph', server graph_id = graphId suffix after ':'.
 * Links: /api/v1/ai/agents route, GraphPicker component, AGENT_DISCOVERY.md
 * @internal
 */

import { z } from "zod";

/**
 * Agent descriptor schema.
 *
 * Per P0_AGENT_GRAPH_IDENTITY: agentId === graphId in P0 (one agent per graph).
 * P1+: agentId becomes stable and may reference multiple assistants per graph.
 *
 * Per LANGGRAPH_SERVER_ALIGNED: field names match LangGraph Server assistant model.
 * - name (not displayName) matches LangGraph Server
 * - description is nullable (LangGraph Server allows null)
 *
 * graphId format is "${providerId}:${graphName}" (e.g., "langgraph:poet").
 * For providerId='langgraph', the suffix after ':' maps to LangGraph Server graph_id.
 */
export const AgentDescriptorSchema = z.object({
  /** Stable agent identifier. P0: === graphId. P1+: stable across assistant variants. */
  agentId: z.string(),
  /** Internal graph reference for routing: "${providerId}:${graphName}" */
  graphId: z.string(),
  /** Human-readable name (matches LangGraph Server 'name' field) */
  name: z.string(),
  /** Description of what this agent does (nullable per LangGraph Server) */
  description: z.string().nullable(),
});

/**
 * Agents list response.
 * - agents: Array of available agent descriptors
 * - defaultAgentId: Default agent to use when none specified
 */
export const aiAgentsOperation = {
  id: "ai.agents.v1",
  summary: "List available agents",
  description:
    "Returns list of available agents with capabilities. AgentIds are stable across execution backends.",
  input: z.object({}), // No input, GET request
  output: z.object({
    agents: z.array(AgentDescriptorSchema),
    defaultAgentId: z.string().nullable(),
  }),
} as const;

// Export inferred types - all consumers MUST use these, never manual interfaces
export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;
export type AgentsOutput = z.infer<typeof aiAgentsOperation.output>;
