# Tools Authoring Guide

> **Scope:** How to add a new tool for AI agents. Authoring only—MCP and authenticated tools are NOT YET SUPPORTED.

## Goal

Add tools that AI agents can invoke. Tools are defined in `@cogni/ai-tools`, bound to real I/O in bootstrap, and executed via `toolRunner.exec()`.

---

## Hard Rules

| #   | Rule                                                                                                      | Ref                    |
| --- | --------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1   | **TOOLS_VIA_TOOLRUNNER**: All execution through `toolRunner.exec()`. No direct calls.                     | TOOL_USE_SPEC #1       |
| 2   | **TOOLS_IN_PACKAGES**: Contracts + implementations in `@cogni/ai-tools`. No tool definitions in `src/**`. | TOOL_USE_SPEC #2       |
| 3   | **TOOLS_IO_VIA_CAPABILITIES**: I/O via injected interfaces, not imports.                                  | TOOL_USE_SPEC #3       |
| 4   | **REDACTION_REQUIRED**: Allowlist-based output filtering. Missing config = error.                         | TOOL_USE_SPEC #4       |
| 5   | **EFFECT_TYPED**: Every tool declares `read_only`, `state_change`, or `external_side_effect`.             | TOOL_USE_SPEC #17      |
| 6   | **NO_REACHABLE_STUBS**: Stubs exist for dev; must never be reachable at runtime.                          | tool-source.factory.ts |
| 7   | **FAIL_FAST_BINDINGS**: Missing binding throws at startup, not at first invocation.                       | tool-source.factory.ts |
| 8   | **TOOL_FILE_PURITY**: No env, no clients, no src/\*\* imports, no secrets.                                | TOOL_USE_SPEC #34      |
| 9   | **NO_DEFAULT_EXECUTABLE_CATALOG**: ai-tools exports contracts only, no default executable catalog.        | TOOL_USE_SPEC #35      |

---

## File Locations

```
packages/ai-tools/src/
├── tools/{name}.ts          # Contract + stub + factory
├── capabilities/{name}.ts   # Capability interface (if I/O)
├── catalog.ts               # TOOL_CATALOG registration
└── index.ts                 # Barrel exports

src/adapters/server/{domain}/
└── {name}.adapter.ts        # Real I/O implementation

src/bootstrap/
├── capabilities/{name}.ts   # Factory: env → capability
└── ai/
    ├── tool-bindings.ts     # { toolId → implementation }
    └── tool-source.factory.ts
```

---

## Checklist: Add a Tool

> ⚠️ **Footgun:** Until enabled-tool gating is implemented, adding ANY tool to the catalog requires a binding in `tool-bindings.ts` or bootstrap fails. Track boilerplate-reduction work in issues, not this doc.

### 1. Contract (`packages/ai-tools/src/tools/{name}.ts`)

```typescript
export const MY_TOOL_NAME = "core__my_tool" as const;  // double underscore

export const myToolContract: ToolContract<...> = {
  name: MY_TOOL_NAME,
  description: "What this tool does",
  effect: "read_only",  // or "state_change" | "external_side_effect"
  inputSchema: MyInputSchema,
  outputSchema: MyOutputSchema,
  redact: (output) => ({ ...allowedFields }),
  allowlist: ["field1", "field2"] as const,
};
```

### 2. Capability Interface (if I/O)

```typescript
// packages/ai-tools/src/capabilities/{name}.ts
export interface MyCapability {
  doThing(params: Params): Promise<Result>;
}
```

### 3. Stub + Factory

```typescript
// packages/ai-tools/src/tools/{name}.ts
export const myToolStubImplementation: ToolImplementation<...> = {
  execute: async () => { throw new Error("MyCapability not configured"); }
};

export function createMyToolImplementation(deps: { myCapability: MyCapability }) {
  return { execute: async (input) => deps.myCapability.doThing(input) };
}

export const myToolBoundTool: BoundTool<...> = {
  contract: myToolContract,
  implementation: myToolStubImplementation,  // replaced at runtime
};
```

### 4. Register Catalog

```typescript
// packages/ai-tools/src/catalog.ts
import { myToolBoundTool } from "./tools/my-tool";

export const TOOL_CATALOG = createToolCatalog([
  getCurrentTimeBoundTool,
  metricsQueryBoundTool,
  myToolBoundTool, // ← add here
]);
```

### 5. Adapter (`src/adapters/server/{domain}/{name}.adapter.ts`)

```typescript
export class MyAdapter implements MyCapability {
  constructor(private config: MyConfig) {}
  async doThing(params: Params): Promise<Result> {
    // Real HTTP/DB/etc logic here
  }
}
```

### 6. Bootstrap Capability (`src/bootstrap/capabilities/{name}.ts`)

```typescript
export function createMyCapability(env: ServerEnv): MyCapability {
  if (!env.MY_API_KEY) return stubMyCapability;
  return new MyAdapter({ apiKey: env.MY_API_KEY });
}
```

> **Composed capabilities:** When a capability needs multiple backends (e.g., git + ripgrep → `RepoCapability`), create separate adapters and compose them in the factory. Adapters should not claim partial interface compliance (`implements Omit<Capability, 'x'>`). The factory returns the single object that satisfies the full interface.

### 7. Wire Bindings (`src/bootstrap/ai/tool-bindings.ts`)

```typescript
export interface ToolBindingDeps {
  metricsCapability: MetricsCapability;
  myCapability: MyCapability;  // ← add
}

export function createToolBindings(deps: ToolBindingDeps): ToolBindings {
  return {
    [GET_CURRENT_TIME_NAME]: getCurrentTimeImplementation,
    [METRICS_QUERY_NAME]: createMetricsQueryImplementation({ ... }),
    [MY_TOOL_NAME]: createMyToolImplementation({  // ← add
      myCapability: deps.myCapability,
    }),
  };
}
```

### 8. Container + Test

```typescript
// src/bootstrap/container.ts
const myCapability = createMyCapability(env);
// Add to Container interface + return

// tests/stack/ai/{name}.stack.test.ts
it("executes via adapter", async () => {
  const result = await toolRunner.exec(MY_TOOL_NAME, validInput);
  expect(result.ok).toBe(true);
});
```

---

## NOT YET SUPPORTED

- **Authenticated tools (connectionId):** see [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md)
- **MCP integration:** see [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) (ToolSourcePort, P2)
- **Approval gates:** see [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) (effects + policy, P1)

---

## Examples

| Tool                     | Type | Capability          | Location                    |
| ------------------------ | ---- | ------------------- | --------------------------- |
| `core__get_current_time` | Pure | None                | `tools/get-current-time.ts` |
| `core__metrics_query`    | I/O  | `MetricsCapability` | `tools/metrics-query.ts`    |

---

## Related

- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — 37 invariants, full implementation checklist
- [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) — Authenticated tools design
- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) — Graph patterns, tool execution flow

---

**Last Updated:** 2026-02-03
