# ai-core · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-01-13
- **Status:** draft

## Purpose

Executor-agnostic AI primitives, and minimal type helpers for cross-process communication. Defines `AiEvent`, `UsageFact`, `ExecutorType`, `RunContext`, and `SourceSystem`. Used by Next.js app and all `GraphExecutorPort` adapters (InProc, LangGraph Server, Claude SDK).

## Pointers

- [LangGraph Server Spec](../../docs/LANGGRAPH_SERVER.md)
- [Graph Execution](../../docs/GRAPH_EXECUTION.md)

## Boundaries

```json
{
  "layer": "packages",
  "may_import": ["packages"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters",
    "shared",
    "services"
  ]
}
```

**External deps:** `json-schema` (types only). Types and minimal runtime utilities (no I/O).

## Public Surface

- **Exports:**
  - `AiEvent` - Union of streaming event types (text_delta, usage_report, assistant_final, done, error)
  - `TextDeltaEvent`, `UsageReportEvent`, `AssistantFinalEvent`, `DoneEvent`, `ErrorEvent` - Individual event types
  - `ToolCallStartEvent`, `ToolCallResultEvent` - Tool execution events
  - `UsageFact` - Billing fact emitted per LLM call
  - `ExecutorType` - Executor discriminator ("langgraph_server" | "claude_sdk" | "inproc")
  - `RunContext` - Run identity provided to relay subscribers
  - `SourceSystem`, `SOURCE_SYSTEMS` - Billing source system enum
  - `ToolSpec` - Canonical tool definition (JSONSchema7 inputSchema)
  - `ToolInvocationRecord` - Tool execution record (timing, result, error)
  - `ToolRedactionConfig` - Redaction config for tool output
  - `AiExecutionErrorCode`, `AI_EXECUTION_ERROR_CODES` - Canonical error codes and runtime array
  - `AiExecutionError`, `isAiExecutionError` - Structured error class and type guard
  - `isAiExecutionErrorCode`, `normalizeErrorToExecutionCode` - Validation and normalization utilities
  - `LlmError`, `LlmErrorKind`, `isLlmError`, `classifyLlmErrorFromStatus` - LLM adapter error types
  - `GraphId` - Namespaced graph identifier type (format: `${providerId}:${graphName}`)
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`, `events/*.ts`, `usage/*.ts`, `context/*.ts`, `billing/*.ts`, `tooling/*.ts`, `execution/*.ts`, `graph/*.ts`

## Ports

- **Uses ports:** none
- **Implements ports:** none

## Responsibilities

- This directory **does**: Define cross-process AI event, billing, and error types; provide type guards and error normalization utilities
- This directory **does not**: Implement business logic, make I/O calls, depend on src/

## Usage

```bash
pnpm --filter @cogni/ai-core typecheck
pnpm --filter @cogni/ai-core build
```

## Standards

- Types and minimal runtime utilities (type guards, error class, normalization)
- All exports must work in both browser and Node.js
- SINGLE_SOURCE_OF_TRUTH: These types must NOT be redefined elsewhere
- ERROR_NORMALIZATION_ONCE: normalizeErrorToExecutionCode() is the canonical normalizer

## Dependencies

- **Internal:** none (standalone package)
- **External:** none

## Change Protocol

- Update this file when public exports change
- Changes require updating `src/types/` re-export shims
- Coordinate with LANGGRAPH_SERVER.md invariants

## Notes

- Per SINGLE_SOURCE_OF_TRUTH invariant: `src/types/` files re-export from this package
- Per PACKAGES_NO_SRC_IMPORTS: This package cannot import from `src/**`
- Package isolation enables LangGraph Server to import these types without Next.js deps
