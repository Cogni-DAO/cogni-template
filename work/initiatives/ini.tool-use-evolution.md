---
work_item_id: ini.tool-use-evolution
work_item_type: initiative
title: Tool Use Evolution — Semantic Types, Wire Adapters, Policy, MCP
state: Active
priority: 1
estimate: 5
summary: Evolve tool infrastructure from P0 foundations through wire adapters, connection auth, MCP integration, and graph-as-tool subagents
outcome: Complete tool pipeline with semantic types, wire adapters, policy enforcement, connection brokering, MCP discovery, and graph-as-tool
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - ai-graphs
  - tooling
---

# Tool Use Evolution — Semantic Types, Wire Adapters, Policy, MCP

> Source: docs/TOOL_USE_SPEC.md

## Goal

Evolve the tool infrastructure from P0 foundations (canonical types, first tool, policy) through wire adapters, connection authorization, MCP integration, and graph-as-tool subagents. Each phase builds on the previous without breaking existing tool execution paths.

## Roadmap

### Crawl (P0): Canonical Tool Semantics + OpenAI Wire Adapter

**Goal:** Semantic tool types, JSONSchema7 compilation, OpenAI wire format.

Per invariants TOOL_SEMANTICS_CANONICAL, WIRE_FORMATS_ARE_ADAPTERS, OPENAI_WIRE_V1_SUPPORTED, JSON_SCHEMA7_PARAMETERS, NO_MANUAL_SCHEMA_DUPLICATION, GOLDEN_FIXTURES_ENFORCE_WIRE_FORMAT.

**Semantic types (`@cogni/ai-core/tooling/`):**

| Deliverable                                                                                           | Status | Est | Work Item |
| ----------------------------------------------------------------------------------------------------- | ------ | --- | --------- |
| Create `ToolSpec { name, description, inputSchema: JSONSchema7, redaction, schemaHash? }`             | Done   | 1   | —         |
| Create `ToolInvocationRecord { toolCallId, name, args, result, error, startedAtMs, endedAtMs, raw? }` | Done   | 1   | —         |
| `raw` field preserves provider-native payload (Anthropic content blocks, attachments)                 | Done   | 0   | —         |
| All internal tool logic uses these types; wire formats are adapter concerns                           | Done   | 0   | —         |

**Schema compilation (`@cogni/ai-tools`):**

| Deliverable                                                                                | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------ | ----------- | --- | --------- |
| Add `zod-to-json-schema` dependency                                                        | Done        | 0   | —         |
| Create `toToolSpec(contract)` in `@cogni/ai-tools/schema.ts`                               | Done        | 1   | —         |
| P0 schema subset validation (rejects oneOf/anyOf/allOf/not/if-then-else/patternProperties) | Not Started | 1   | —         |
| Remove manual JSON Schema in `chat.runner.ts`                                              | Done        | 0   | —         |

**OpenAI wire adapter (`src/adapters/server/ai/`):**

> Note: P0 uses LangGraph's `createReactAgent` which handles tool call assembly internally. Explicit encoder/decoder is P1 for non-LangGraph paths.

| Deliverable                                                                         | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------- | ----------- | --- | --------- |
| `OpenAIToolEncoder(ToolSpec)` → `tools[]` for LLM request (P1: non-LangGraph paths) | Not Started | 1   | —         |
| `OpenAIToolDecoder(stream)` → `ToolInvocationRecord` + tool AiEvents (P1)           | Not Started | 1   | —         |
| Replace simplified `JsonSchemaObject` with proper `JSONSchema7` import (P1)         | Not Started | 1   | —         |

**Golden fixtures (`tests/contracts/`):**

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| `openai-tool-wire-format.test.ts` — tool definition serialization (P1) | Not Started | 1   | —         |
| `tool-call-delta-assembly.test.ts` — stream delta accumulation (P1)    | Not Started | 1   | —         |
| Tool replay test — `tests/stack/ai/chat-tool-replay.stack.test.ts`     | Done        | 0   | —         |

**Chores:**

| Deliverable   | Status      | Est | Work Item |
| ------------- | ----------- | --- | --------- |
| Observability | Not Started | 1   | —         |
| Documentation | Not Started | 1   | —         |

### Crawl (P0): First Tool End-to-End

**Goal:** Full tool execution pipeline from contract to UI.

**Port layer:**

| Deliverable                                                         | Status | Est | Work Item |
| ------------------------------------------------------------------- | ------ | --- | --------- |
| Add tool types to `llm.port.ts`                                     | Done   | 0   | —         |
| Tools passed via `GraphRunRequest.toolIds` → `configurable.toolIds` | Done   | 0   | —         |

**Package layer:**

| Deliverable                                                                | Status | Est | Work Item |
| -------------------------------------------------------------------------- | ------ | --- | --------- |
| Create `get_current_time` tool in `@cogni/ai-tools/tools/`                 | Done   | 1   | —         |
| Create `@cogni/ai-tools` package with ToolContract, BoundTool types        | Done   | 1   | —         |
| Create `toLangChainTool()` converter in `@cogni/langgraph-graphs/runtime/` | Done   | 1   | —         |
| Agentic loop via `createReactAgent` in `@cogni/langgraph-graphs`           | Done   | 1   | —         |

**Provider layer:**

| Deliverable                                                               | Status | Est | Work Item |
| ------------------------------------------------------------------------- | ------ | --- | --------- |
| `LangGraphInProcProvider` wires tools from runtime-bound `ToolSourcePort` | Done   | 1   | —         |
| `createToolRunner()` with policy enforcement at runtime                   | Done   | 1   | —         |

**Contract layer:**

| Deliverable                                                            | Status | Est | Work Item |
| ---------------------------------------------------------------------- | ------ | --- | --------- |
| Extend `AssistantUiInputSchema` to accept tool-call/tool-result parts  | Done   | 1   | —         |
| Add JSONValue schema for JSON-serializable validation                  | Done   | 0   | —         |
| Add cross-field constraints and size limits                            | Done   | 0   | —         |
| Extend `toMessageDtos()` to convert tool messages                      | Done   | 0   | —         |
| Add `validateToolCallIdConsistency()` for orphan tool-result detection | Done   | 0   | —         |
| Add regression tests (`tests/contract/ai.chat.v1.contract.test.ts`)    | Done   | 1   | —         |

**Route layer:**

| Deliverable                                              | Status | Est | Work Item |
| -------------------------------------------------------- | ------ | --- | --------- |
| Route tool handling using `controller.addToolCallPart()` | Done   | 0   | —         |

**UI layer (optional for MVP):**

| Deliverable                                        | Status      | Est | Work Item |
| -------------------------------------------------- | ----------- | --- | --------- |
| Create `ToolFallback.tsx` for generic tool display | Not Started | 1   | —         |

### Crawl (P0): Tool Policy Enforcement

**Goal:** Effect-typed tools, deny-by-default, data-driven policy.

Per invariants EFFECT_TYPED, POLICY_IS_DATA, DENY_BY_DEFAULT, TOOL_ID_NAMESPACED.

| Deliverable                                                      | Status | Est | Work Item |
| ---------------------------------------------------------------- | ------ | --- | --------- |
| Add `ToolEffect` type to `@cogni/ai-core/tooling/types.ts`       | Done   | 0   | —         |
| Add `effect: ToolEffect` to ToolContract and ToolSpec            | Done   | 0   | —         |
| Update existing tools with effect declarations                   | Done   | 0   | —         |
| Create `ToolPolicy` interface                                    | Done   | 1   | —         |
| Create `ToolCatalog` interface                                   | Done   | 1   | —         |
| Move `tool-runner.ts` to canonical location                      | Done   | 0   | —         |
| Update `toolRunner.exec()` to enforce ToolPolicy                 | Done   | 0   | —         |
| Add `policy_denied` to `ToolErrorCode`                           | Done   | 0   | —         |
| Add namespace prefix to tool names (`core__`)                    | Done   | 0   | —         |
| Tests: deny-by-default, policy filter, require_approval, catalog | Done   | 1   | —         |

### Crawl (P0): Tool Source Port + Connection Authorization

**Goal:** ToolSourcePort abstraction, capability injection, connection grant intersection.

Per invariants TOOL_SOURCE_RETURNS_BOUND_TOOL, NO_SECRETS_IN_CONTEXT, AUTH_VIA_CAPABILITY_INTERFACE, GRANT_INTERSECTION_REQUIRED, ARCH_SINGLE_EXECUTION_PATH.

**ToolSourcePort abstraction (`@cogni/ai-core/tooling/`):**

| Deliverable                                                                   | Status      | Est | Work Item |
| ----------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `ToolSourcePort` interface with `getBoundTool()` and `listToolSpecs()` | Done        | 1   | —         |
| Create `BoundToolRuntime` interface                                           | Done        | 1   | —         |
| Create `ToolInvocationContext` type with base fields                          | Done        | 0   | —         |
| Add identity fields to `ToolInvocationContext` (see RBAC wiring below)        | Not Started | 1   | —         |
| Refactor `createToolRunner()` to accept `ToolSourcePort`                      | Done        | 0   | —         |
| toolRunner calls boundTool validation/exec/redact pipeline                    | Done        | 0   | —         |

**StaticToolSource (`@cogni/ai-core/tooling/sources/`):**

| Deliverable                                             | Status | Est | Work Item |
| ------------------------------------------------------- | ------ | --- | --------- |
| Create `StaticToolSource` implementing `ToolSourcePort` | Done   | 1   | —         |
| Export from ai-core barrel                              | Done   | 0   | —         |

**Connection authorization (`@cogni/ai-core/tooling/`):**

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `allowedConnectionIds?: string[]` to `GraphRunConfig`              | Not Started | 1   | —         |
| Add `executionGrant?` to toolRunner config                             | Not Started | 0   | —         |
| Implement `computeEffectiveConnections(grant, request)` → intersection | Not Started | 1   | —         |
| Validate `connectionId ∈ effectiveConnectionIds` BEFORE broker resolve | Not Started | 0   | —         |
| Return `policy_denied` if connectionId not in intersection             | Not Started | 0   | —         |

**Capability-based auth (`@cogni/ai-tools/capabilities/`):**

| Deliverable                                                                  | Status      | Est | Work Item |
| ---------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `AuthCapability` interface (invocation-scoped, no connectionId param) | Done        | 0   | —         |
| Create `ConnectionClientFactory` interface                                   | Not Started | 1   | —         |
| Tools declare capability dependencies in contract                            | Not Started | 0   | —         |
| Composition root binds capabilities to broker-backed implementations         | Not Started | 1   | —         |
| toolRunner injects resolved capabilities into boundTool.exec()               | Not Started | 1   | —         |

**Architectural tests (`tests/arch/`):**

| Deliverable                                                              | Status      | Est | Work Item |
| ------------------------------------------------------------------------ | ----------- | --- | --------- |
| `tool-single-execution-path.test.ts` — grep for direct tool.func() calls | Not Started | 1   | —         |
| `no-secrets-in-context.test.ts` — static check for secret fields         | Not Started | 1   | —         |
| `connection-grant-intersection.test.ts` — intersection enforcement       | Not Started | 1   | —         |

**Wiring:**

| Deliverable                                                        | Status      | Est | Work Item |
| ------------------------------------------------------------------ | ----------- | --- | --------- |
| Update `LangGraphInProcProvider` to use `ToolSourcePort`           | Not Started | 1   | —         |
| Update `src/bootstrap/ai/tool-bindings.ts` with `StaticToolSource` | Not Started | 1   | —         |
| Update LangChain wrappers to use new toolRunner signature          | Not Started | 1   | —         |

**RBAC wiring (per AUTHZ_CHECK_BEFORE_TOOL_EXEC, CONTEXT_HAS_IDENTITY):**

| Deliverable                                                    | Status      | Est | Work Item |
| -------------------------------------------------------------- | ----------- | --- | --------- |
| Add `actorId: string` to `ToolInvocationContext`               | Not Started | 0   | —         |
| Add `subjectId?: string` to `ToolInvocationContext` (OBO only) | Not Started | 0   | —         |
| Add `tenantId: string` to `ToolInvocationContext`              | Not Started | 0   | —         |
| Inject `AuthorizationPort` into `createToolRunner()` config    | Not Started | 1   | —         |
| Call `authz.check()` before step 4 in pipeline                 | Not Started | 1   | —         |
| Add `authz_denied` and `authz_unavailable` to `ToolErrorCode`  | Not Started | 0   | —         |
| Arch test: `authz-at-tool-exec.test.ts`                        | Not Started | 1   | —         |

### Crawl (P0.x): Tool Authoring Foundation

**Goal:** Streamlined tool authoring with minimal boilerplate.

**P0.1 Enabled-tool gating:**

| Deliverable                                                 | Status      | Est | Work Item |
| ----------------------------------------------------------- | ----------- | --- | --------- |
| ToolSource binding validates only enabled tool IDs          | Not Started | 1   | —         |
| `listToolSpecs()` returns only enabled tools                | Not Started | 0   | —         |
| Acceptance: adding a disabled tool does not break bootstrap | Not Started | 0   | —         |

**P0.2 ToolModule manifest + registry:**

| Deliverable                                                                     | Status      | Est | Work Item |
| ------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Define `ToolModule` interface in `@cogni/ai-tools/modules/types.ts`             | Not Started | 1   | —         |
| Bootstrap auto-binds modules from registry                                      | Not Started | 1   | —         |
| Acceptance: adding a pure tool = 1 file; I/O tool = tool module + adapter + env | Not Started | 0   | —         |

**P0.3 Connection broker + grant intersection:**

| Deliverable                                                                       | Status      | Est | Work Item |
| --------------------------------------------------------------------------------- | ----------- | --- | --------- |
| `toolRunner.exec()` enforces allowlist/policy + grant intersection BEFORE resolve | Not Started | 1   | —         |
| Credentials resolved via `ConnectionBrokerPort` using `ctx.connectionId`          | Not Started | 1   | —         |
| Acceptance: auth-required tools cannot execute without connectionId + grants      | Not Started | 0   | —         |

### Walk (P1): Tool Ecosystem + ToolCatalog

**Goal:** Tool telemetry, UI rendering, tenant-based policy, human-in-the-loop.

| Deliverable                                                                        | Status      | Est | Work Item |
| ---------------------------------------------------------------------------------- | ----------- | --- | --------- |
| `GraphLlmCaller` type enforcement (graphRunId requires graph_name + graph_version) | Not Started | 1   | —         |
| Include tools in `promptHash` computation (canonical tool schema)                  | Not Started | 1   | —         |
| `ToolFallback.tsx` for unregistered tool names                                     | Not Started | 1   | —         |
| Tool telemetry in `ai_invocation_summaries` (tool_calls count, latency)            | Not Started | 1   | —         |
| ToolCatalog becomes first-class (UI rendering, agent discovery)                    | Not Started | 2   | —         |
| Tenant/role-based ToolPolicy via config (use Casbin if complex)                    | Not Started | 2   | —         |
| Human-in-the-loop approval for `state_change`/`external_side_effect` tools         | Not Started | 2   | —         |

### Run (P2): MCP + Dynamic Tool Sources

**Goal:** MCP tool discovery with untrusted-by-default policy.

Per invariant MCP_UNTRUSTED_BY_DEFAULT.

| Deliverable                                                                  | Status      | Est | Work Item |
| ---------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `ToolProvider` interface: `StaticToolProvider` + `McpToolProvider`    | Not Started | 2   | —         |
| MCP tool discovery via `tools/list` (read-only; no auto-enable)              | Not Started | 1   | —         |
| Handle `tools/list_changed`: refresh catalog, keep policy unchanged          | Not Started | 1   | —         |
| MCP tool ID format: `mcp:<serverId>:<toolName>`                              | Not Started | 0   | —         |
| Add test: MCP drift (newly discovered tool not enabled until policy changes) | Not Started | 1   | —         |
| Consider OPA/Cedar if centralized policy infrastructure needed               | Not Started | 1   | —         |

### Run (P3): Graph-as-Tool (Subagents)

**Goal:** Graphs callable as tools with strict budgets and depth limits.

| Deliverable                                                                      | Status      | Est | Work Item |
| -------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `GraphTool` contract: implementation calls `GraphExecutorPort.runGraph()` | Not Started | 2   | —         |
| Enforce `allowedGraphs` allowlist                                                | Not Started | 1   | —         |
| Enforce `maxDepth = 1` (no recursive subgraphs in P3)                            | Not Started | 1   | —         |
| Enforce strict budgets (time/tokens/USD)                                         | Not Started | 1   | —         |
| Enforce bounded output (summary-first)                                           | Not Started | 1   | —         |
| LangGraph interrupts for human-in-the-loop approval                              | Not Started | 1   | —         |

### PX: Advanced (Do NOT Build Yet)

| Deliverable                     | Status      | Est | Work Item |
| ------------------------------- | ----------- | --- | --------- |
| Multi-tool parallel execution   | Not Started | 3   | —         |
| Tool result streaming (partial) | Not Started | 2   | —         |

#### File Pointers (P0)

| File                                                  | Change                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/contracts/ai.chat.v1.contract.ts`                | Extended: tool-call/tool-result parts, JSONValue, cross-field validation             |
| `src/app/api/v1/ai/chat/route.ts`                     | Extended: `toMessageDtos()` handles tool messages, `validateToolCallIdConsistency()` |
| `tests/contract/ai.chat.v1.contract.test.ts`          | Regression tests for tool message validation                                         |
| `@cogni/ai-core/tooling/types.ts`                     | `ToolSpec`, `ToolInvocationRecord` — canonical semantic types                        |
| `@cogni/ai-tools/schema.ts`                           | `toToolSpec(contract)` — compiles Zod contract → ToolSpec                            |
| `src/adapters/server/ai/openai-tool-encoder.ts`       | `OpenAIToolEncoder(ToolSpec)` → `tools[]`                                            |
| `src/adapters/server/ai/openai-tool-decoder.ts`       | `OpenAIToolDecoder(stream)` → `ToolInvocationRecord` + AiEvents                      |
| `src/adapters/server/ai/litellm.adapter.ts`           | Use encoder/decoder; parse `delta.tool_calls` in SSE stream                          |
| `src/adapters/server/ai/langgraph/inproc.provider.ts` | Uses tool contracts from catalog                                                     |
| `@cogni/ai-tools/tools/get-current-time.ts`           | Contract + implementation with capability injection                                  |
| `@cogni/ai-tools/capabilities/*.ts`                   | Capability interfaces (e.g., Clock) for tool IO                                      |
| `@cogni/langgraph-graphs/runtime/langchain-tools.ts`  | `toLangChainTool()` wrapper for LangGraph execution                                  |
| `src/bootstrap/ai/tools.bindings.ts`                  | Bind capabilities → adapters for Next.js runtime                                     |
| `src/features/ai/components/tools/ToolFallback.tsx`   | Generic tool result UI component                                                     |
| `tests/contracts/openai-tool-wire-format.test.ts`     | Golden fixture tests for OpenAI wire format conformance                              |
| `src/shared/ai/tool-policy.ts`                        | `ToolPolicy` interface for deny-by-default enforcement                               |
| `src/shared/ai/tool-catalog.ts`                       | `ToolCatalog` interface for explicit tool visibility                                 |

**P0: Tool Source Port + Connection Auth (new files):**

| File                                                  | Change                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `@cogni/ai-core/tooling/ports/tool-source.port.ts`    | `ToolSourcePort` interface with `getBoundTool()`, `listToolSpecs()`  |
| `@cogni/ai-core/tooling/types.ts`                     | Add: `BoundToolRuntime`, `ToolInvocationContext`, `ToolCapabilities` |
| `@cogni/ai-core/tooling/sources/static.source.ts`     | `StaticToolSource` wrapping TOOL_CONTRACTS; runtime binds caps       |
| `@cogni/ai-tools/capabilities/auth.ts`                | `AuthCapability` interface for broker-backed auth                    |
| `@cogni/ai-tools/capabilities/index.ts`               | Capability barrel exports                                            |
| `tests/arch/tool-single-execution-path.test.ts`       | Grep for direct tool.func() calls outside toolRunner                 |
| `tests/arch/no-secrets-in-context.test.ts`            | Static check for secret-shaped fields in context types               |
| `tests/unit/ai/connection-grant-intersection.test.ts` | Grant intersection logic + deny-fast behavior                        |

## Constraints

- **TOOLS_VIA_TOOLRUNNER**: All tool execution via `toolRunner.exec()` — no bypass paths
- **DENY_BY_DEFAULT**: Unknown/disabled tools fail loudly
- **NO_SECRETS_IN_CONTEXT**: Only opaque reference IDs in context, never credentials
- **MCP_UNTRUSTED_BY_DEFAULT**: MCP tools not auto-enabled on discovery

## Dependencies

- [ ] ConnectionBrokerPort (ini.tenant-connections P0)
- [ ] AuthorizationPort (RBAC spec)
- [ ] LangGraph infrastructure (existing)

## As-Built Specs

- [tool-use.md](../../docs/spec/tool-use.md) — Core invariants, design decisions, architecture, pipeline

## Design Notes

_(none yet)_
