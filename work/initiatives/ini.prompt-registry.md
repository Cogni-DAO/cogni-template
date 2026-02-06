---
work_item_id: ini.prompt-registry
work_item_type: initiative
title: Prompt Registry — Langfuse Integration & Prompt Management
state: Paused
priority: 2
estimate: 4
summary: Implement PromptRegistryPort with Langfuse adapter, prefetch injection, and prompt versioning/rollout
outcome: Prompts managed in Langfuse with label-based rollout, fallback to in-repo constants, and full trace correlation
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [ai-graphs]
---

# Prompt Registry — Langfuse Integration & Prompt Management

> Source: docs/PROMPT_REGISTRY_SPEC.md — Spec: [prompt-registry.md](../../docs/spec/prompt-registry.md)

## Goal

Implement prompt management through a `PromptRegistryPort` with Langfuse as the primary adapter and in-repo constants as fallback. Enable label-based rollout (staging → production), prefetch injection into graph execution context, and full trace correlation for prompt versioning.

## Roadmap

### Crawl (P0) — PromptRegistryPort + Adapter Prefetch

**Goal:** Port interface, adapters, prefetch injection, and trace correlation for poet graph.

| Deliverable                                                                                                                   | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `PromptRegistryPort` interface in `src/ports/prompt-registry.port.ts`                                                  | Not Started | 1   | —         |
| Create `LangfusePromptRegistryAdapter` in `src/adapters/server/ai/langfuse-prompt-registry.adapter.ts`                        | Not Started | 2   | —         |
| Create `InRepoPromptAdapter` in `src/adapters/server/ai/in-repo-prompt.adapter.ts`                                            | Not Started | 1   | —         |
| Create `FakePromptRegistryAdapter` in `src/adapters/test/ai/fake-prompt-registry.adapter.ts`                                  | Not Started | 1   | —         |
| Add `promptRegistry` to `Container` and wire in `bootstrap/container.ts`                                                      | Not Started | 1   | —         |
| Add `LANGFUSE_PROMPT_CACHE_TTL_SECONDS` env var (default 300)                                                                 | Not Started | 1   | —         |
| Export `PROMPT_REFS` manifest from each graph's `prompts.ts` (poet first)                                                     | Not Started | 1   | —         |
| Extend `CogniExecContext` with `promptLookup: (key: string) => string`                                                        | Not Started | 1   | —         |
| In `LangGraphInProcProvider.runGraph()`: read `PROMPT_REFS`, prefetch via port, inject into ALS context                       | Not Started | 2   | —         |
| In poet graph: read system prompt via `promptLookup("system")` instead of importing constant                                  | Not Started | 1   | —         |
| In `message-preparation.ts`: resolve `baseline-system` prompt via port, fallback to core constant                             | Not Started | 1   | —         |
| Attach `{promptName, promptVersion, promptLabel, promptSource}` to Langfuse traces and `ai_invocation_summaries`              | Not Started | 1   | —         |
| Add `prompt_name`, `prompt_version`, `prompt_label`, `prompt_source` columns to `ai_invocation_summaries` (Drizzle migration) | Not Started | 1   | —         |
| Observability instrumentation                                                                                                 | Not Started | 1   | —         |
| Documentation updates                                                                                                         | Not Started | 1   | —         |

### Walk (P1) — Rollout Mechanism + Compile Validation

**Goal:** Template variable validation, CI snapshot export, label rollout flow, remaining prompt migration.

| Deliverable                                                                           | Status      | Est | Work Item            |
| ------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Implement prompt compile check: validate template variables before LLM call           | Not Started | 2   | (create at P1 start) |
| CI step: export Langfuse prompts to `prompts/snapshots/` for review/audit             | Not Started | 1   | (create at P1 start) |
| Define label rollout flow: `staging` → `canary` → `production`; rollback = label flip | Not Started | 1   | (create at P1 start) |
| Migrate remaining movable prompts (see classification in spec)                        | Not Started | 2   | (create at P1 start) |
| Add eval smoke tests for critical prompts (format/schema adherence)                   | Not Started | 2   | (create at P1 start) |

### Run (P2+) — Governance Prompts

**Goal:** Governance prompt needs evaluation. Do NOT build preemptively.

| Deliverable                                                       | Status      | Est | Work Item            |
| ----------------------------------------------------------------- | ----------- | --- | -------------------- |
| Evaluate governance prompt needs when RBAC flows are implemented  | Not Started | 1   | (create at P2 start) |
| Define code-locked safety prompt schema for structured validation | Not Started | 2   | (create at P2 start) |

## Constraints

- `latest` label forbidden outside `local` environment (invariant PROMPT_IDENTITY_IMMUTABLE)
- Code-locked prompts never fetched remotely — safety/contract prompts ship with code
- No `src/` imports from packages — graphs declare `PROMPT_REFS` (pure data) only
- No prompt passing through `GraphRunRequest` — resolved inside the provider
- Prompts must never contain secrets — template variables injected at runtime from secure context

## Dependencies

- [ ] Langfuse instance with prompt management enabled
- [ ] `CogniExecContext` ALS infrastructure (exists)
- [ ] `ai_invocation_summaries` table (exists, needs migration for new columns)

## As-Built Specs

- [prompt-registry.md](../../docs/spec/prompt-registry.md) — port interface, injection architecture, prompt classification, label strategy (draft)

## Design Notes

Content extracted from `docs/PROMPT_REGISTRY_SPEC.md` during docs migration. All design content (invariants, TypeScript interfaces, architecture diagrams, classification tables, rejected alternatives) preserved in the spec. Implementation checklists routed here.
