---
id: ai-evals-spec
type: spec
title: AI Architecture and Evals
status: active
spec_state: draft
trust: draft
summary: AI stack architecture (LangGraph + OTel + Langfuse), feature-centric graph conventions, and eval regression gate policy.
read_when: Working on AI graphs, prompts, evals, or observability for LLM workflows.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [ai-graphs]
---

# AI Architecture & Evals

## Context

AI behavior must be reproducible and testable. LLM-facing changes require eval regression gates. This spec defines the AI stack, graph location conventions, eval harness structure, and CI gate policy.

## Goal

Ensure all AI orchestration follows feature-centric conventions, prompt changes are version-tracked, and every LLM-facing PR passes eval regression gates before merge.

## Non-Goals

- Runtime prompt A/B testing infrastructure (Langfuse handles externally)
- Custom eval frameworks beyond golden-output comparison
- Non-LLM AI workloads (classical ML pipelines)

## Core Invariants

1. **FEATURE_CENTRIC_GRAPHS**: Graphs live in `src/features/<feature>/ai/`, NOT in a shared package. Packages are only for cross-repo contracts after proven reuse.

2. **GRAPH_BOUNDARY_ISOLATION**: Graphs must not contain HTTP handlers, database access, direct adapter/IO imports, or business logic unrelated to AI orchestration.

3. **PROMPT_VERSION_TRACKING**: Prompts stored as text files or template modules, not inline strings. Changes tracked in git with semantic commit messages. `prompt_hash` computed per call for drift detection.

4. **EVAL_REGRESSION_GATE**: All golden tests must pass (within tolerance) for LLM-facing PRs. New prompts require at least 3 golden cases.

5. **GOLDEN_UPDATE_DISCIPLINE**: Never silently update goldens to make CI pass. Intentional prompt improvement → update golden + commit message explaining why. Model upgrade → re-baseline all goldens + document in changelog.

6. **OTEL_CANONICAL_TRACING**: All AI operations emit OpenTelemetry spans. Langfuse consumes OTel traces as sink.

## Design

### Stack

| Layer             | Technology    | Purpose                                |
| ----------------- | ------------- | -------------------------------------- |
| **Orchestration** | LangGraph     | Graph-based agent workflows            |
| **Observability** | OpenTelemetry | Canonical tracing/metrics              |
| **AI Platform**   | Langfuse      | Prompt versioning, eval UI, trace sink |

### Graph Location (Feature-Centric)

**Location:** `src/features/<feature>/ai/`

**Allowed in graphs:**

- LangGraph workflow definitions
- Prompt templates (versioned, parameterized)
- Tool schemas + response parsers
- Model routing policy (provider/model selection)
- Safety constraints + guardrails

**Forbidden in graphs:**

- HTTP handlers or API routes
- Database access
- Direct adapter/IO imports
- Business logic unrelated to AI orchestration

#### Structure

```
src/features/<feature>/ai/
  graphs/               # LangGraph workflow definitions
    <graph>.graph.ts    # Graph definition (pure logic)
  prompts/              # Prompt templates
    <graph>.prompt.ts   # System/user prompts
  tools/                # Tool contracts (feature-scoped)
    <tool>.tool.ts      # Zod schema + handler interface
  services/             # Orchestration
    <graph>.ts          # Bridges ports, receives graphRunId from facade
```

### Prompt Versioning

- Prompts stored as text files or template modules, not inline strings
- Changes tracked in git with semantic commit messages
- Langfuse syncs prompt versions for A/B testing
- `prompt_hash` computed per call for drift detection

### evals/ Charter

Location: `evals/` (root level, not a package)

**Purpose:** Test AI behavior for regressions before merge.

#### Structure

```
evals/
  datasets/               # Input fixtures
    review/
      simple-pr.json
      complex-refactor.json
      security-issue.json
    admin/
      merge-request.json
  goldens/                # Expected outputs (versioned)
    review/
      simple-pr.golden.json
      complex-refactor.golden.json
  harness/                # Test runner
    run-evals.ts
    compare.ts
    report.ts
  config.ts               # Model configs for eval runs
  README.md
```

#### Golden Output Format

```json
{
  "input_hash": "abc123",
  "model": "gpt-4o",
  "expected": {
    "decision": "approve | request_changes | comment",
    "key_findings": ["finding1", "finding2"],
    "confidence": 0.85
  },
  "tolerance": {
    "decision": "exact",
    "key_findings": "subset",
    "confidence": 0.1
  }
}
```

### Observability

#### OpenTelemetry (Canonical)

All AI operations emit OTel spans:

```typescript
// Example span structure
{
  name: "ai.graph.review",
  attributes: {
    "ai.model": "gpt-4o",
    "ai.prompt.version": "v1.2.0",
    "ai.tokens.input": 1500,
    "ai.tokens.output": 200,
    "ai.latency_ms": 2300
  }
}
```

#### Langfuse Integration

Langfuse consumes OTel traces as sink:

- Prompt versioning UI
- Cost tracking per prompt/model
- Eval dataset management
- A/B test analysis

**Data flow:**

```
LangGraph → OTel SDK → OTel Collector → Langfuse
                                     → Loki (logs)
                                     → Grafana (dashboards)
```

### CI Gate Policy

| Gate                    | Requirement                                              |
| ----------------------- | -------------------------------------------------------- |
| **Eval regression**     | All golden tests pass (within tolerance)                 |
| **New prompt coverage** | New prompts require at least 3 golden cases              |
| **Cost delta**          | Token usage increase < 20% vs baseline (warn, not block) |

#### CI Integration

```yaml
# In CI workflow
- name: Run AI Evals
  run: pnpm eval:run
  env:
    LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}

- name: Check Eval Results
  run: pnpm eval:check --fail-on-regression
```

### Ownership

| Component              | Owner                                   |
| ---------------------- | --------------------------------------- |
| Feature graphs/prompts | Feature owner                           |
| `evals/`               | Whoever owns the AI code being tested   |
| Langfuse instance      | Operator (shared) or Node (self-hosted) |

### File Pointers

| File                                 | Purpose                            |
| ------------------------------------ | ---------------------------------- |
| `src/features/<feature>/ai/graphs/`  | LangGraph workflow definitions     |
| `src/features/<feature>/ai/prompts/` | Prompt templates (version-tracked) |
| `src/features/<feature>/ai/tools/`   | Tool contracts (feature-scoped)    |
| `evals/`                             | Eval harness, datasets, goldens    |

## Acceptance Checks

**Automated:**

- `pnpm eval:run` — runs all golden tests
- `pnpm eval:check --fail-on-regression` — CI gate for eval regressions

**Manual:**

1. Verify new prompts have at least 3 golden cases
2. Confirm golden updates include explanatory commit messages

## Open Questions

_(none)_

## Related

- [AI Setup](./ai-setup.md) — P0/P1/P2 checklists, ID map, invariants
