# tools · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-23
- **Status:** stable

## Purpose

Tool contracts and implementations for the agentic loop. Each tool exports a contract (Zod schemas, validation, redaction) and implementation (execute function).

## Pointers

- [Tool Use Spec](../../../../docs/TOOL_USE_SPEC.md)
- [Tool Registry](../tool-registry.ts)
- [Tool Runner](../tool-runner.ts)
- [Parent AGENTS.md](../AGENTS.md)

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["ports", "types", "shared"],
  "must_not_import": ["app", "adapters", "core"]
}
```

## Public Surface

- **Exports:** Tool bound exports (contract + implementation per tool)
  - `getCurrentTimeBoundTool` - Returns current UTC time (no IO, pure)
  - `getCurrentTimeLlmDefinition` - OpenAI-compatible tool definition
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** Each tool file exports its bound tool and LLM definition

## Ports

- **Uses ports:** LlmToolDefinition (type from ports/llm.port.ts)
- **Implements ports:** none
- **Contracts:** Per TOOL_USE_SPEC.md, each tool has contract + implementation

## Responsibilities

- **This directory does:**
  - Define tool contracts (name, validateInput, validateOutput, redact, allowlist)
  - Implement tool execution logic
  - Export LLM-compatible tool definitions (OpenAI function format)
  - Provide Zod schemas for input/output validation

- **This directory does not:**
  - Register tools (owned by tool-registry.ts)
  - Execute tools in context (owned by tool-runner.ts)
  - Handle tool call lifecycle events (owned by graphs/)

## Usage

```typescript
// Tools are registered in tool-registry.ts
import {
  getCurrentTimeBoundTool,
  getCurrentTimeLlmDefinition,
} from "./tools/get-current-time.tool";

// In tool-registry.ts
const CHAT_GRAPH_TOOLS = {
  get_current_time: getCurrentTimeBoundTool,
};
```

## Standards

- Each tool file exports:
  - `*BoundTool` - Contract + implementation
  - `*LlmDefinition` - OpenAI function format
  - `*InputSchema` / `*OutputSchema` - Zod schemas
- Pure tools (no IO) return output directly
- IO tools inject dependencies via context
- Redact function strips sensitive data from output

## Dependencies

- **Internal:** @/ports (LlmToolDefinition), ../types (BoundTool, ToolContract)
- **External:** zod

## Change Protocol

- Adding a tool: Create file, register in tool-registry.ts
- Update this file when adding tools
- Run pnpm check before committing

## Notes

- MVP: get_current_time is the first tool (no IO, simplest possible)
- Per TOOL_USE_SPEC: Invalid JSON args → safe error, continue loop
- Per GRAPHS_USE_TOOLRUNNER_ONLY: Tools execute only via toolRunner.exec()
