---
id: prompt-registry-spec
type: spec
title: Prompt Registry
status: draft
spec_state: draft
trust: draft
summary: PromptRegistryPort with Langfuse adapter, prefetch injection into graph context, label-based rollout, and in-repo fallback.
read_when: You are implementing or modifying prompt management, adding new prompts, or changing the prompt injection architecture.
implements: ini.prompt-registry
owner: derekg1729
created: 2026-02-07
verified: 2026-02-07
tags: [ai-graphs]
---

# Prompt Registry

## Context

Prompts are fetched through a `PromptRegistryPort` at the **adapter layer** (`LangGraphInProcProvider`) and injected into graphs as resolved strings. Graphs export a pure-data `PROMPT_REFS` manifest; they never import from `src/` or call Langfuse directly. No "latest" label in production.

## Goal

Provide a port-based prompt resolution system where graphs declare prompt dependencies via manifests, the adapter layer prefetches and injects resolved content, and Langfuse serves as the primary prompt store with in-repo fallback — enabling label-based rollout, version pinning, and full trace correlation.

## Non-Goals

1. Building a custom prompt editor UI — use Langfuse's native UI
2. Graphs importing from `src/` or calling ports directly
3. Passing prompts through `GraphRunRequest` from feature layer
4. Prompt content containing secrets or PII

## Core Invariants

1. **PROMPT_IDENTITY_IMMUTABLE**: Every prompt fetch specifies `{name, label}` or `{name, version}`. The `latest` label is forbidden outside `local` environment.

2. **PROMPT_TRACE_LINK**: Every LLM call attaches `{promptName, promptVersion, promptLabel, promptSource}` to its Langfuse trace/span and `ai_invocation_summaries` row. These four fields must match exactly between the trace and the DB row.

3. **CODE_LOCKED_PROMPTS_NEVER_REMOTE**: Safety/contract prompts (citation rules, tool schemas, no-hallucination guards) stay in code and are never fetched from Langfuse. Code-locked entries in `PROMPT_REFS` are skipped by the provider; graphs use the in-repo constant directly.

4. **REPO_FALLBACK_ALWAYS_AVAILABLE**: If Langfuse is unreachable, `InRepoPromptAdapter` returns the baked-in fallback constant from the repo. This is not "last-known-good" — it is the version committed with the code. The system never blocks on prompt fetch failure.

5. **PROMPT_COMPILE_VALIDATES**: Before sending to LLM, all template variables are validated — required variables must be present, unknown variables are rejected.

6. **ADAPTER_PREFETCHES_PROMPTS**: `LangGraphInProcProvider` reads the graph's `PROMPT_REFS` manifest, calls `PromptRegistryPort.getPrompt()` for each non-code-locked ref, and injects a `resolvedPrompts` map into the graph execution context. Graphs never perform I/O to fetch prompts.

7. **GRAPH_OWNS_PROMPT_IDENTITY**: Graphs own which prompts they need (via `PROMPT_REFS` manifest) and how they use them. The provider resolves content; graphs consume it. This refines `GRAPH_OWNS_MESSAGES`: graphs own prompt identity (name + key), not necessarily content.

## Schema

**New columns on `ai_invocation_summaries`:**

- `prompt_name` (text, nullable) — Langfuse prompt name or in-repo constant name
- `prompt_version` (text, nullable) — Langfuse version number or git SHA
- `prompt_label` (text, nullable) — Label used for fetch (e.g. "production", "staging")
- `prompt_source` (text, nullable) — "langfuse" or "in-repo"; indicates which adapter resolved the prompt

**Why all four columns?** You need label + source to debug rollout behavior, cache effects, and fallback usage. These must match exactly what is attached to Langfuse traces.

**No new tables.** Prompt content lives in Langfuse; correlation lives in existing telemetry.

## Design

### Injection Architecture

#### Who calls what (layer compliance)

```
┌──────────────────────────────────────────────────────────────────┐
│ packages/langgraph-graphs (CANNOT import src/)                   │
│                                                                  │
│  graphs/poet/prompts.ts:                                         │
│    export const POET_SYSTEM_PROMPT = "..." (fallback constant)   │
│    export const PROMPT_REFS = [                                  │
│      { key: "system", name: "poet-system" },                     │
│    ]                                                             │
│                                                                  │
│  graphs/poet/graph.ts:                                           │
│    // Reads resolved prompt from injected lookup                 │
│    const systemPrompt = promptLookup("system");                  │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                    inject resolved map
                              │
┌──────────────────────────────────────────────────────────────────┐
│ src/adapters/server/ai/langgraph/inproc.provider.ts              │
│ (CAN import ports + shared)                                      │
│                                                                  │
│  1. Read graph's PROMPT_REFS from catalog                        │
│  2. Resolve environment label (e.g. "production") from env       │
│  3. For each non-codeLocked ref:                                 │
│       await promptRegistry.getPrompt({name, label})              │
│  4. Build resolvedPrompts: Record<key, content>                  │
│  5. Inject into CogniExecContext.promptLookup                    │
│  6. Call createInProcGraphRunner(...)                             │
└──────────────────────────────────────────────────────────────────┘
                              │
                    calls port interface
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/ports/prompt-registry.port.ts (interface only)               │
│   PromptRegistryPort.getPrompt(ref) → CompiledPrompt            │
└──────────────────────────────────────────────────────────────────┘
                              │
               wired by bootstrap/container.ts
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ src/adapters/server/ai/                                          │
│   langfuse-prompt-registry.adapter.ts (primary, cached)          │
│   in-repo-prompt.adapter.ts (fallback, reads repo constants)     │
└──────────────────────────────────────────────────────────────────┘
```

#### BASELINE_SYSTEM_PROMPT (special case)

`BASELINE_SYSTEM_PROMPT` lives in `src/core/ai/system-prompt.server.ts`. Core **cannot** import ports. Resolution:

- Core keeps the constant as fallback only.
- `src/features/ai/services/message-preparation.ts` (feature layer, **can** import ports) resolves the environment label and calls `PromptRegistryPort.getPrompt({name: "baseline-system", label})` with an explicit label before applying the system prompt.
- If fetch fails, falls back to the core constant.

### Key Decisions

### 1. Port Interface

```typescript
interface PromptRegistryPort {
  getPrompt(ref: PromptRef): Promise<CompiledPrompt>;
}

type PromptRef = {
  name: string; // e.g. "poet-system", "research-supervisor"
  variables?: Record<string, string>; // template variables
} & (
  | { label: string; version?: never } // label-based (normal path)
  | { version: number; label?: never } // explicit version pin (escape hatch)
);

interface CompiledPrompt {
  content: string; // resolved prompt text
  name: string;
  version: string; // version identifier (number or "in-repo")
  label?: string;
  source: "langfuse" | "in-repo";
}
```

**Rule:** `label` and `version` are mutually exclusive and one is always required. Callers (`LangGraphInProcProvider`, `message-preparation.ts`) resolve the label from the deploy environment before calling the port. The port never infers a default — `PROMPT_IDENTITY_IMMUTABLE` is enforced at the callsite.

### 2. Graph Prompt Manifest

Each graph exports a `PROMPT_REFS` array from its `prompts.ts`:

```typescript
// packages/langgraph-graphs/src/graphs/poet/prompts.ts

/** Fallback constant (used by InRepoPromptAdapter) */
export const POET_SYSTEM_PROMPT = `...` as const;

/** Manifest of prompts this graph needs. Provider reads this to prefetch. */
export const PROMPT_REFS = [{ key: "system", name: "poet-system" }] as const;
```

For code-locked prompts:

```typescript
// packages/langgraph-graphs/src/graphs/brain/prompts.ts

export const BRAIN_SYSTEM_PROMPT = `...` as const;

export const PROMPT_REFS = [
  { key: "system", name: "brain-system", codeLocked: true },
] as const;
```

**Rule:** `PROMPT_REFS` is pure data (no functions, no imports from `src/`). The provider reads it from the catalog; graphs never see the port.

### 3. CogniExecContext Extension

```typescript
// packages/langgraph-graphs/src/runtime/cogni/exec-context.ts

export interface CogniExecContext {
  readonly completionFn: CompletionFn;
  readonly tokenSink: { push: (event: AiEvent) => void };
  readonly toolExecFn: ToolExecFn;
  /** Sync lookup for resolved prompts. Throws if key not found. */
  readonly promptLookup: (key: string) => string;
}
```

`promptLookup` is synchronous — all prompts are prefetched before graph invocation. This keeps graph code sync and avoids cascading async changes.

**Fail-fast on missing key:** `promptLookup` throws immediately if the key is not in the resolved map, with diagnostic metadata: `{ graphId, missingKey, availableKeys }`. This prevents silent prompt drift — a missing `PROMPT_REFS` entry surfaces as a hard error at invocation time, not a silent empty string.

### 4. Adapter Priority (Fallback Chain)

```
┌─────────────────────────────────────────────────────────────────────┐
│ FETCH (non-blocking, cached)                                        │
│ 1. LangfusePromptRegistryAdapter.getPrompt({name, label})           │
│ 2. If Langfuse returns → cache (TTL from env) → return              │
│ 3. If Langfuse fails → InRepoPromptAdapter.getPrompt({name})        │
│ 4. Return compiled prompt with source tag                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Why fallback, not failover?** Prompts are not worth blocking a request. The in-repo version is always available and correct (just possibly stale).

### 5. Label Strategy

Callers (`LangGraphInProcProvider`, `message-preparation.ts`) resolve the label from the deploy environment before calling the port. The port itself has no label defaulting logic.

| Environment  | Caller resolves to | Allowed                               |
| ------------ | ------------------ | ------------------------------------- |
| `local`      | `latest`           | Any label, `latest`, explicit version |
| `preview`    | `staging`          | `staging`, explicit version           |
| `production` | `production`       | `production`, explicit version        |

**Rollout flow:** Author prompt in Langfuse UI → test locally (`latest`) → promote to `staging` label → validate in preview → promote to `production` label. Rollback = flip `production` label to previous version.

### 6. Cache Awareness

- Default TTL: 300s (5 minutes)
- After label flip, first requests may still serve cached version
- Acceptable tradeoff: prompt changes are not latency-sensitive
- For emergency rollback: set TTL to 0 via env var override + restart

### Prompt Classification

#### Code-Locked (stay in repo, never fetched remotely)

| Prompt                    | File                                                    | Reason                                                   |
| ------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `BRAIN_SYSTEM_PROMPT`     | `packages/langgraph-graphs/src/graphs/brain/prompts.ts` | Citation/no-hallucination contract — must ship with code |
| `TOOL_USE_INSTRUCTION`    | `src/features/ai/prompts/chat.prompt.ts`                | Tool schema coupling — must match tool definitions       |
| `TOOL_ERROR_RECOVERY`     | `src/features/ai/prompts/chat.prompt.ts`                | Error handling contract — behavior must be deterministic |
| Future governance prompts | TBD                                                     | Safety/compliance — require code review for changes      |

**Rule:** If a prompt enforces a safety invariant, references tool schemas by name, or defines error-handling behavior, it stays in code. Code-locked prompts have `codeLocked: true` in their `PROMPT_REFS` entry; the provider skips them during prefetch.

#### Movable to Langfuse (iteration, versioning, rollback)

| Prompt                      | File                                                       | Why movable                                             |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| `BASELINE_SYSTEM_PROMPT`    | `src/core/ai/system-prompt.server.ts`                      | Identity/voice — changes frequently, no safety contract |
| `POET_SYSTEM_PROMPT`        | `packages/langgraph-graphs/src/graphs/poet/prompts.ts`     | Identity/voice — duplicate of baseline, pure UX         |
| `PONDERER_SYSTEM_PROMPT`    | `packages/langgraph-graphs/src/graphs/ponderer/prompts.ts` | Personality prompt — pure UX                            |
| `CHAT_GRAPH_SYSTEM_PROMPT`  | `src/features/ai/prompts/chat.prompt.ts`                   | Generic assistant prompt — no schema coupling           |
| `SUPERVISOR_SYSTEM_PROMPT`  | `packages/langgraph-graphs/src/graphs/research/prompts.ts` | Research orchestration — benefits from rapid iteration  |
| `RESEARCHER_SYSTEM_PROMPT`  | `packages/langgraph-graphs/src/graphs/research/prompts.ts` | Research execution — benefits from A/B testing          |
| `COMPRESSION_SYSTEM_PROMPT` | `packages/langgraph-graphs/src/graphs/research/prompts.ts` | URL curation — pure UX                                  |
| `FINAL_REPORT_PROMPT`       | `packages/langgraph-graphs/src/graphs/research/prompts.ts` | Report formatting — changes frequently                  |
| `RESEARCH_BRIEF_PROMPT`     | `packages/langgraph-graphs/src/graphs/research/prompts.ts` | Brief generation — benefits from rapid iteration        |

**Rule:** If a prompt defines personality, formatting, or orchestration strategy without safety implications, it moves to Langfuse.

### Rejected Alternatives

1. **Feature layer passes prompts via `GraphRunRequest`**: Pollutes port types with prompt awareness, creates broad callsite churn, and forces features to know which prompts each graph needs.

2. **Provider hardcodes prompt lists**: Duplicates knowledge that belongs in the graph package. Only acceptable if reading from graph-exported manifest (which is what we do).

3. **Async `promptFn` in graphs**: Cascades async changes across every graph prompt usage site, complicates control flow. Prefetch + sync lookup avoids this entirely.

4. **Graphs import from `src/`**: Violates `PACKAGES_NO_SRC_IMPORTS`. Non-negotiable.

### Guardrails

1. **No secrets in prompt content.** Template variables are injected at runtime from secure context. Prompt text in Langfuse contains `{date}`, `{userQuestion}` — never API keys or PII.

2. **No `src/` imports from packages.** Graphs declare `PROMPT_REFS` (pure data) and call `promptLookup()` (injected via ALS). No port, adapter, or feature imports.

3. **No prompt passing through `GraphRunRequest`.** Prompts are resolved inside the provider, not passed down from features.

4. **Provider reads manifest, not hardcoded lists.** `LangGraphInProcProvider` reads `PROMPT_REFS` from the catalog entry. No hand-maintained prompt lists in `src/`.

### File Pointers

| File                                                          | Purpose                                                                                      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/ports/prompt-registry.port.ts`                           | New: `PromptRegistryPort` interface + `PromptRef`, `CompiledPrompt` types                    |
| `src/adapters/server/ai/langfuse-prompt-registry.adapter.ts`  | New: Langfuse prompt fetch with cache + label pinning                                        |
| `src/adapters/server/ai/in-repo-prompt.adapter.ts`            | New: Fallback adapter loading from repo constants                                            |
| `src/adapters/test/ai/fake-prompt-registry.adapter.ts`        | New: Test adapter with deterministic responses                                               |
| `src/bootstrap/container.ts`                                  | Wire `promptRegistry: PromptRegistryPort`                                                    |
| `src/shared/env/server.ts`                                    | Add `LANGFUSE_PROMPT_CACHE_TTL_SECONDS`                                                      |
| `src/ports/ai-telemetry.port.ts`                              | Add `promptName`, `promptVersion`, `promptLabel`, `promptSource` to `RecordInvocationParams` |
| `src/adapters/server/ai-telemetry/langfuse.adapter.ts`        | Attach prompt metadata to traces                                                             |
| `src/adapters/server/ai/langgraph/inproc.provider.ts`         | Read `PROMPT_REFS`, prefetch via port, inject into ALS                                       |
| `packages/langgraph-graphs/src/runtime/cogni/exec-context.ts` | Add `promptLookup: (key: string) => string` to `CogniExecContext`                            |
| `packages/langgraph-graphs/src/graphs/poet/prompts.ts`        | Add `PROMPT_REFS` manifest; keep constant as fallback                                        |
| `src/features/ai/services/message-preparation.ts`             | Resolve `baseline-system` prompt via port                                                    |
| `src/shared/db/schema.ai.ts`                                  | Add `prompt_name`, `prompt_version`, `prompt_label`, `prompt_source` columns                 |
| `src/adapters/server/db/migrations/`                          | New migration for `ai_invocation_summaries` columns                                          |

## Acceptance Checks

**Manual (not yet implemented):**

1. `PromptRegistryPort.getPrompt({name, label})` returns compiled prompt from Langfuse
2. Fallback to in-repo constant when Langfuse unreachable
3. `promptLookup("system")` in poet graph returns resolved content
4. `ai_invocation_summaries` rows contain `prompt_name`, `prompt_version`, `prompt_label`, `prompt_source`
5. `latest` label rejected in non-local environments

## Open Questions

- [ ] Should prompt cache be shared across requests (process-level) or per-request?
- [ ] Should `PROMPT_REFS` support conditional refs (e.g. different prompts per model)?

## Related

- [Initiative: ini.prompt-registry](../../work/initiatives/ini.prompt-registry.md)
- [ai-setup.md](./ai-setup.md) — Langfuse integration
- [ai-evals.md](./ai-evals.md) — eval harness that may use prompt variants
