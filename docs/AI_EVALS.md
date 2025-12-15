# AI Architecture & Evals

> [!CRITICAL]
> AI behavior must be reproducible and testable. LLM-facing changes require eval regression gates.

## Stack

| Layer             | Technology    | Purpose                                |
| ----------------- | ------------- | -------------------------------------- |
| **Orchestration** | LangGraph     | Graph-based agent workflows            |
| **Observability** | OpenTelemetry | Canonical tracing/metrics              |
| **AI Platform**   | Langfuse      | Prompt versioning, eval UI, trace sink |

---

## packages/ai-core Charter

Location: `packages/ai-core/`

**Allowed:**

- LangGraph graph definitions
- Prompt templates (versioned, parameterized)
- Tool schemas + response parsers
- Model routing policy (provider/model selection)
- Safety constraints + guardrails

**Forbidden:**

- HTTP handlers or API routes
- Database access
- Business logic unrelated to AI orchestration
- Provider-specific SDK wrappers (use adapters instead)

### Structure

```
packages/ai-core/
  src/
    graphs/               # LangGraph workflow definitions
      review.graph.ts     # PR review workflow
      admin.graph.ts      # Admin action workflow
    prompts/              # Prompt templates
      review/
        system.txt
        user.txt
      admin/
        system.txt
    tools/                # Tool definitions + schemas
      repo-read.tool.ts
      diff-analyze.tool.ts
    parsers/              # Response parsers
      review-output.parser.ts
    routing/              # Model selection logic
      provider.router.ts
    safety/               # Guardrails
      content-filter.ts
    index.ts              # Public exports
  package.json
  tsconfig.json
```

### Prompt Versioning

- Prompts stored as text files, not inline strings
- Changes tracked in git with semantic commit messages
- Langfuse syncs prompt versions for A/B testing

---

## evals/ Charter

Location: `evals/` (root level, not a package)

**Purpose:** Test AI behavior for regressions before merge.

### Structure

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

### Golden Output Format

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

---

## Observability

### OpenTelemetry (Canonical)

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

### Langfuse Integration

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

---

## CI Gate Policy

### Required for LLM-Facing PRs

| Gate                    | Requirement                                              |
| ----------------------- | -------------------------------------------------------- |
| **Eval regression**     | All golden tests pass (within tolerance)                 |
| **New prompt coverage** | New prompts require at least 3 golden cases              |
| **Cost delta**          | Token usage increase < 20% vs baseline (warn, not block) |

### CI Integration

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

### When to Update Goldens

1. Intentional prompt improvement → update golden + commit message explaining why
2. Model upgrade → re-baseline all goldens + document in changelog
3. Never silently update goldens to make CI pass

---

## Ownership

| Component          | Owner                                                    |
| ------------------ | -------------------------------------------------------- |
| `packages/ai-core` | Node (for Node AI features) or Operator (for service AI) |
| `evals/`           | Whoever owns the AI code being tested                    |
| Langfuse instance  | Operator (shared) or Node (self-hosted)                  |

---

**Last Updated**: 2025-01-13
**Status**: Design Approved
