# AI Setup Spec

> [!CRITICAL]
> All AI calls must have end-to-end correlation IDs (request_id + trace_id) propagated from Next.js → LangGraph → LiteLLM → ai_invocation_summaries → Langfuse.

## Core Invariants

1. **Reproducibility**: Every AI run must capture: graph_name, graph_version (git SHA), prompt_hash (content hash), router_policy_version, resolved provider+model.

2. **Correlation**: `request_id` + `trace_id` propagate end-to-end; store `litellm_call_id` and `langfuse_trace_id` as join keys.

3. **Data Handling**: Prod redacts prompts/responses; eval runs must persist full prompt/response artifacts for debugging (local files or Langfuse datasets).

4. **Billing Separation**: `charge_receipts` stays minimal for billing/audit. `ai_invocation_summaries` captures telemetry summaries.

---

## Contracts

### Reproducibility Keys (per run/span)

| Key                     | Source           | Purpose             |
| ----------------------- | ---------------- | ------------------- |
| `graph_name`            | ai-core export   | Which workflow ran  |
| `graph_version`         | git SHA at build | Exact code version  |
| `prompt_hash`           | Content hash     | Detect prompt drift |
| `router_policy_version` | Semver or SHA    | Model routing logic |
| `provider` + `model`    | LiteLLM response | Resolved target     |

### Correlation IDs

| ID                  | Generated At         | Propagates To                                        |
| ------------------- | -------------------- | ---------------------------------------------------- |
| `request_id`        | Request entry (once) | All layers, charge_receipts, ai_invocation_summaries |
| `trace_id`          | Explicit root span   | LiteLLM metadata, Langfuse, OTel span attributes     |
| `litellm_call_id`   | LiteLLM response     | ai_invocation_summaries (join key)                   |
| `langfuse_trace_id` | Langfuse SDK         | ai_invocation_summaries (debug URL)                  |
| `graph_run_id`      | Per graph execution  | Optional: multiple AI calls within one request_id    |

**ID Strategy:**

- One stable `request_id` per user-initiated request—do NOT generate new IDs per layer
- `trace_id` for distributed tracing; `span_id` changes per operation
- `request_id` attached as OTel span attribute AND forwarded in LiteLLM metadata

### Eval Artifact Policy

| Environment   | Prompts/Responses       | Full Artifacts | Storage                          |
| ------------- | ----------------------- | -------------- | -------------------------------- |
| **prod**      | Redacted (never logged) | No             | N/A                              |
| **eval/CI**   | Full capture required   | Yes            | Local files or Langfuse datasets |
| **local dev** | Console only            | Optional       | Never committed                  |

---

## Implementation Checklist

### P0: MVP - Observability Foundation

- [ ] Enforce Node runtime for AI routes (`export const runtime = 'nodejs'`)
- [ ] OTel instrumentation with explicit root span at request entry (do not rely on auto-instrumentation)
- [ ] Store `trace_id` deterministically from root span into RequestContext
- [ ] Direct Langfuse SDK integration (not OTel exporter) to reliably obtain `langfuse_trace_id`
- [ ] Propagate `reqId` + `trace_id` in LiteLLM metadata
- [ ] Create `ai_invocation_summaries` table (see schema below)
- [ ] Write correlation IDs to ai_invocation_summaries on every AI call

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: ai-core Package + Eval Harness

- [ ] Create `packages/ai-core` per [PACKAGES_ARCHITECTURE.md](PACKAGES_ARCHITECTURE.md)
- [ ] Implement one real graph (e.g., `review.graph.ts`) + prompt files
- [ ] Tool contracts with Zod schemas (see tool structure below)
- [ ] Create `evals/` runner with 3-5 fixtures + goldens
- [ ] CI gate: require explicit golden update policy

### P2: Future (Do NOT Build Yet)

- [ ] Evaluate ClickHouse/data lake after eval loop works
- [ ] PostHog analytics (requires stable correlation IDs first)
- [ ] Tempo distributed tracing (after OTel foundation stable)
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

| File                                        | Change                                   |
| ------------------------------------------- | ---------------------------------------- |
| `src/shared/observability/server/otel.ts`   | New: OTel SDK init + context propagation |
| `src/adapters/server/ai/litellm.adapter.ts` | Attach trace_id to LiteLLM metadata      |
| `src/shared/db/schema.ai.ts`                | New: ai_invocation_summaries table       |
| `src/features/ai/services/completion.ts`    | Write to ai_invocation_summaries         |
| `src/bootstrap/container.ts`                | Wire Langfuse sink                       |

---

## Schema: `ai_invocation_summaries`

**Purpose:** Covers both direct LLM calls and LangGraph runs. Clearly not billing; clearly not full telemetry.

| Column              | Type        | Notes                                                |
| ------------------- | ----------- | ---------------------------------------------------- |
| `id`                | uuid        | PK                                                   |
| `request_id`        | text        | NOT NULL (multiple rows per request allowed)         |
| `trace_id`          | text        | NOT NULL (from explicit root span)                   |
| `langfuse_trace_id` | text        | Nullable, debug URL                                  |
| `litellm_call_id`   | text        | Nullable, join to /spend/logs                        |
| `graph_run_id`      | text        | Nullable (identifies graph execution within request) |
| `graph_name`        | text        | Nullable (null = direct LLM call)                    |
| `graph_version`     | text        | Nullable, git SHA                                    |
| `provider`          | text        | e.g., "openai", "anthropic"                          |
| `model`             | text        | Resolved model ID                                    |
| `tokens_in`         | int         | Nullable                                             |
| `tokens_out`        | int         | Nullable                                             |
| `tokens_total`      | int         | Nullable                                             |
| `provider_cost_usd` | numeric     | Nullable                                             |
| `latency_ms`        | int         | Call duration                                        |
| `status`            | text        | "success" / "error"                                  |
| `error_code`        | text        | Nullable                                             |
| `created_at`        | timestamptz |                                                      |

**Uniqueness:** `UNIQUE(request_id, litellm_call_id)` — allows multiple AI calls per request while preventing duplicate inserts.

**Do NOT add:** prompts, responses, full metadata blobs.

---

## LiteLLM Ownership Policy

**LiteLLM is canonical for:**

- Detailed spend logs (`/spend/logs`)
- Per-call telemetry history
- Deep analytics queries

**Local store captures:**

- Only what's available at call-time (headers, stream usage)
- Correlation IDs for resilience
- Summary for Activity dashboard fallback

**Avoid:**

- Replicating LiteLLM spend/log tables locally
- Activity dashboards hard-depending on LiteLLM uptime without fallback

---

## Design Decisions

### 1. Package Location

| Component            | Location                        | Rationale                        |
| -------------------- | ------------------------------- | -------------------------------- |
| LangGraph graphs     | `packages/ai-core`              | Pure logic, no HTTP/DB           |
| Prompt templates     | `packages/ai-core/src/prompts/` | Versioned text files             |
| Tool contracts       | `packages/ai-core/src/tools/`   | Schema + handler interface       |
| Tool implementations | `src/adapters/tools/`           | IO + policy + instrumentation    |
| Route handlers       | `src/app/`                      | Thin entrypoints calling ai-core |

**Rule:** `packages/ai-core` MUST NOT import from `src/`. See [PACKAGES_ARCHITECTURE.md](PACKAGES_ARCHITECTURE.md).

### 2. Tool Structure

**Per-tool files:**

- `packages/ai-core/src/tools/<tool>.tool.ts` - Contract: name, schema (Zod), typed handler interface, parsing helpers
- `src/adapters/tools/<tool>.impl.ts` - Implementation: IO, policy checks, instrumentation

**Single registry:**

- `src/features/ai/tool-registry.ts` - Binds tool contracts to implementations (DI wiring)

**Ports guidance:** One port per external system, NOT per tool.

| Port              | Backs Tools            |
| ----------------- | ---------------------- |
| `KnowledgePort`   | RAG search, doc lookup |
| `WebResearchPort` | Web search, URL fetch  |
| `RepoPort`        | Code search, file read |
| `McpPort`         | MCP server calls       |

**Anti-patterns:**

- One port interface per tool when multiple tools hit same backend
- Putting IO inside ai-core tool definitions
- Tool contracts without schemas (breaks evals)

### 3. Correlation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ REQUEST ENTRY (Next.js middleware)                                  │
│ 1. Generate request_id (UUID)                                       │
│ 2. Start OTel span → trace_id                                       │
│ 3. Attach to RequestContext                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ LLM CALL (completion.ts → litellm.adapter.ts)                       │
│ - Pass request_id, trace_id in LiteLLM metadata                     │
│ - Receive litellmCallId from response                               │
│ - Create Langfuse trace/span → langfuse_trace_id                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PERSISTENCE                                                         │
│ charge_receipts: billing only (chargedCredits, responseCostUsd)     │
│ ai_invocation_summaries: telemetry + correlation IDs                │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Eval Harness Requirements

**Structured outputs:** All AI responses must validate against Zod schema.

**Deterministic compare:** Golden matching uses explicit tolerances:

```json
{
  "decision": "exact",
  "key_findings": "subset",
  "confidence": 0.1
}
```

**Golden update policy:** Never silently update to make CI pass. Requires commit message explaining why.

---

## Anti-Patterns to Avoid

1. **No data lake before evals work** - ClickHouse/PostHog wait for stable correlation IDs
2. **No graphs in app routes** - LangGraph stays in `packages/ai-core`, never absorbs HTTP/DB
3. **No LiteLLM-only telemetry** - Always have local summary fallback + correlation IDs
4. **No port-per-tool** - Ports per external system, tools compose on top
5. **No IO in ai-core** - Tool contracts define schemas; implementations live in adapters

---

## Related Docs

- [AI_EVALS.md](AI_EVALS.md) - Stack details, eval structure, CI gates
- [PACKAGES_ARCHITECTURE.md](PACKAGES_ARCHITECTURE.md) - Package creation rules
- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal layers

---

**Last Updated**: 2025-12-16
**Status**: Design Approved
