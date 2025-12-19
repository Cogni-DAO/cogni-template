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

| Key                     | Source                | Purpose             |
| ----------------------- | --------------------- | ------------------- |
| `graph_name`            | Graph module constant | Which workflow ran  |
| `graph_version`         | Git SHA at build      | Exact code version  |
| `prompt_hash`           | Content hash          | Detect prompt drift |
| `router_policy_version` | Semver or SHA         | Model routing logic |
| `provider` + `model`    | LiteLLM response      | Resolved target     |

### Correlation ID Map

| ID                  | Scope                     | Purpose                                                 |
| ------------------- | ------------------------- | ------------------------------------------------------- |
| `request_id`        | One per inbound request   | Primary join across all systems                         |
| `trace_id`          | One per distributed trace | OTel backbone; 32-hex                                   |
| `span_id`           | One per operation         | Tracing UI only; **do NOT persist as durable join key** |
| `invocation_id`     | One per LLM call attempt  | Idempotency key; UNIQUE in ai_invocation_summaries      |
| `graph_run_id`      | One per graph execution   | Groups multiple LLM calls within a request              |
| `langfuse_trace_id` | Langfuse-specific         | Optional debug join; equals trace_id when enabled       |
| `litellm_call_id`   | LiteLLM call ID           | Join to /spend/logs; may be null on errors              |

**ID Categories:**

| Category                        | IDs                                           | Notes                                                 |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| **Essential (always required)** | `request_id`, `trace_id`, `invocation_id`     | Must be non-null on every ai_invocation_summaries row |
| **Essential for graphs**        | `graph_run_id`, `graph_name`, `graph_version` | Required when LLM call is within a graph execution    |
| **Nice-to-have**                | `langfuse_trace_id`, `litellm_call_id`        | Nullable; depends on external service availability    |

**ID Strategy:**

- One stable `request_id` per user-initiated request—do NOT generate new IDs per layer
- `trace_id` for distributed tracing; `span_id` changes per operation (never persist span_id)
- `request_id` attached as OTel span attribute AND forwarded in LiteLLM metadata
- `invocation_id` generated per LLM call attempt (idempotency key for retries)

### Eval Artifact Policy

| Environment   | Prompts/Responses       | Full Artifacts | Storage                          |
| ------------- | ----------------------- | -------------- | -------------------------------- |
| **prod**      | Redacted (never logged) | No             | N/A                              |
| **eval/CI**   | Full capture required   | Yes            | Local files or Langfuse datasets |
| **local dev** | Console only            | Optional       | Never committed                  |

---

## Implementation Checklist

### P0: MVP - Observability Foundation

- [x] Enforce Node runtime for AI routes (`export const runtime = 'nodejs'`)
- [x] OTel instrumentation with explicit root span at request entry (do not rely on auto-instrumentation)
- [x] Store `trace_id` deterministically from root span into RequestContext
- [x] Direct Langfuse SDK integration (not OTel exporter) to reliably obtain `langfuse_trace_id`
- [x] Propagate `reqId` + `trace_id` in LiteLLM metadata
- [x] Create `ai_invocation_summaries` table (see schema below)
- [x] Write correlation IDs to ai_invocation_summaries on every AI call

#### P0 Known Issues

- [x] Stack test for telemetry writes (`tests/stack/ai/ai-telemetry.stack.test.ts` validates `ai_invocation_summaries` rows)

#### Chores

- [x] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [x] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: First LangGraph Graph

Create first graph inside a feature slice with full correlation flow. No package required.

**Runtime choice:** P1 uses assistant-ui **Data Stream Protocol** (`@assistant-ui/react-data-stream`). We are NOT using assistant-ui's LangGraph runtime (`@assistant-ui/react-langgraph`). Server emits DSP chunks; client uses standard data-stream runtime.

#### P1 Deliverables

**P1 instance:** `src/features/ai/graphs/chat.graph.ts` (chat subfeature under AI feature).

- [ ] Implement first graph (`src/features/<feature>/ai/graphs/<graph>.graph.ts`)
- [ ] Create prompt templates (`src/features/<feature>/ai/prompts/<graph>.prompt.ts`)
- [ ] Create orchestration service (`src/features/<feature>/ai/services/<graph>.ts`)
- [x] Create `src/features/ai/services/ai_runtime.ts` as single AI entrypoint (decides graph vs direct LLM, generates `graphRunId`)
- [ ] Create `src/features/ai/tool-runner.ts` for tool execution + AiEvent emission
- [x] Integrate chat route: consumes AiEvents from runtime, maps to Data Stream Protocol

#### P1 Invariants (Blocking for Merge)

- [ ] **GRAPH_CALLER_TYPE_REQUIRED**: Use distinct caller types: `LlmCaller` (no graphRunId) vs `GraphLlmCaller` (extends LlmCaller with REQUIRED `graphRunId`, `graphName`, `graphVersion`). Do NOT add graphRunId as optional field on base LlmCaller.
- [ ] **PROMPT_HASH_VERSION_IN_PAYLOAD**: `prompt_hash_version: 'v1'` must be embedded inside the canonical payload that is hashed, not just exported as a constant.
- [ ] **HASHING_SINGLE_CALL_SITE**: Only `litellm.adapter.ts` computes `promptHash`. Graph code must NOT compute or re-compute it.
- [ ] **GRAPH_METADATA_ENFORCED**: If `caller.graphRunId` is present, then `graph_name` and `graph_version` must be non-null on `ai_invocation_summaries` rows. Enforced by telemetry writer validation.
- [ ] **GRAPHS_NO_IO**: Graphs must not import IO/adapters; routes stay thin; graphs live in feature slices.
- [ ] **GRAPHS_USE_TOOLRUNNER_ONLY**: Graphs invoke tools exclusively through `toolRunner.exec()`. No direct tool implementation calls. ToolRunner is sole owner of toolCallId generation and tool lifecycle AiEvents.
- [x] **AI_RUNTIME_EMITS_AIEVENTS**: ai_runtime emits AiEvents only (text_delta for P1; tool events when graphs land). Route layer maps AiEvents → Data Stream Protocol using official assistant-ui helper. Runtime never touches protocol encoding.
- [ ] **DATA_STREAM_PROTOCOL_ONLY**: Chat route maps AiEvents to assistant-ui Data Stream Protocol chunks via official helper; never invent custom SSE vocabulary.
- [ ] **TOOLCALL_ID_STABLE**: Tool calls use either model-provided `tool_call.id` (when model-initiated) or UUID generated at tool-runner boundary (when graph-initiated). Same `toolCallId` persists across all stream chunks (start→args→result). Never use `span_id` as `toolCallId`.
- [x] **RUNTIME_STREAMS_ASYNC_ITERABLE**: ai_runtime must return `AsyncIterable<AiEvent>`, yielding immediately. No buffering or `Promise<AiEvent[]>`. Buffering breaks live tool-running state in UI.
- [ ] **TOOLRUNNER_ALLOWLIST_HARD_FAIL**: Redaction uses explicit allowlist per tool. Missing allowlist or redaction failure → emit `tool_call_result` as error with safe message. Never pass-through unknown fields.
- [ ] **TOOLRUNNER_RESULT_SHAPE**: `toolRunner.exec()` returns `{ok:true, value}` | `{ok:false, errorCode, safeMessage}`. Error codes: `validation`, `execution`, `unavailable`, `redaction_failed`. Graphs handle via result shape, not exceptions.
- [ ] **TOOLRUNNER_PIPELINE_ORDER**: Fixed order: validate args → execute → validate result → redact → emit AiEvent → return. Validation failures still emit `tool_call_result` error event with same `toolCallId`.

#### P1 File Pointers

| File                                                  | Purpose                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/features/ai/types.ts`                            | AiEvent type definition (feature-internal, NOT in shared/)                       |
| `src/features/ai/services/ai_runtime.ts`              | Single AI entrypoint; decides graph vs direct; emits AiEvents                    |
| `src/features/ai/tool-runner.ts`                      | Tool execution; owns toolCallId; emits tool lifecycle AiEvents; redacts payloads |
| `src/features/<feature>/ai/graphs/<graph>.graph.ts`   | Graph definition (pure logic, no IO)                                             |
| `src/features/<feature>/ai/prompts/<graph>.prompt.ts` | Prompt templates                                                                 |
| `src/features/<feature>/ai/services/<graph>.ts`       | Orchestration: bridges ports, receives `graphRunId` from runtime                 |
| `src/app/api/v1/ai/chat/route.ts`                     | Consumes AiEvents; maps to Data Stream Protocol                                  |
| `src/shared/ai/prompt-hash.ts`                        | `computePromptHash()`, `PROMPT_HASH_VERSION`                                     |
| `src/adapters/server/ai/litellm.adapter.ts`           | Sole `promptHash` computation site                                               |

---

### Streaming & Tool UI Integration

#### Tool UI Mapping

- Tool names are stable API identifiers (snake_case, versioned if needed)
- Every tool must have Zod `inputSchema` and `outputSchema` for UI rendering and eval validation
- Frontend components registered by `toolName` (e.g., `knowledge_search` → `<KnowledgeSearchUI />`)
- Always provide `ToolFallback` for unregistered tools

#### ToolCallId Provenance

**Model-initiated tool calls:** Use `tool_call.id` from model response (e.g., OpenAI's `call_123abc`)

**Graph-initiated tool calls:** Generate UUID at tool-runner boundary; persist as `toolCallId` across all stream chunks

**Invariant:** Same `toolCallId` must appear in start→args→result chunks; enables UI to correlate tool lifecycle without relay on internal span_id.

#### Stream Redaction Policy

**Redaction ownership:**

- **ToolRunner** redacts tool payloads per allowlist before emitting AiEvents
- **Route** may apply final transport-level truncation as last-mile enforcement

**Prod stream payloads:**

- Never stream full request/response bodies (redact entirely)
- Stream UI-safe summaries + references only: tool name, execution status (running/success/error), result summary (IDs/URLs/counts), error message (no secrets)
- Allowlist fields per tool (e.g., `KnowledgeSearchResult` streams `{ query, resultCount, topHitUrl }` not full documents)
- Truncate long strings (e.g., >500 chars) to summary + reference link
- Never stream tokens, API keys, raw sensitive data, large code diffs, or full documents

**Eval/CI:**

- Capture full prompt/response artifacts out-of-band (Langfuse datasets or local files in `evals/artifacts/`)
- Don't include full artifacts in user-facing stream by default
- Only stream redacted payloads same as prod

#### Example Redaction (knowledge_search tool)

| Field              | Prod Stream                          | Full Artifact (Eval Only)              |
| ------------------ | ------------------------------------ | -------------------------------------- |
| `query`            | ✓ (query string)                     | ✓ Full query                           |
| `documents`        | ✗ (redacted, stream count + top URL) | ✓ Full documents in eval artifact file |
| `relevance_scores` | ✗                                    | ✓ Full scores in eval                  |
| `error`            | ✓ (message only)                     | ✓ Full error + stack                   |

---

### P2: First Eval Runner

Build eval harness to validate graph outputs against golden fixtures.

#### P2 Deliverables

- [ ] Create `evals/` directory structure
- [ ] Implement `evals/runner.ts` harness (load fixtures, run graph, compare goldens)
- [ ] Add 3-5 fixtures for review graph (`evals/fixtures/review-*.json`)
- [ ] Create corresponding goldens (`evals/goldens/review-*.golden.json`)
- [ ] Add `evals/scripts/update-goldens.ts` with explicit `--update` flag
- [ ] CI gate: fail if goldens change without `--update-goldens` flag

#### P2 Invariants

- [ ] **GOLDEN_UPDATE_POLICY**: Never silently update goldens to make CI pass. Requires commit message explaining why.
- [ ] **STRUCTURED_OUTPUT_VALIDATION**: All AI responses must validate against Zod schema before golden comparison.
- [ ] **DETERMINISTIC_COMPARE**: Golden matching uses explicit tolerances (exact, subset, numeric delta).
- [ ] **EVAL_ARTIFACT_CAPTURE**: Eval runs must persist full prompt/response artifacts (local files or Langfuse datasets).

#### P2 File Pointers

| File                              | Purpose                     |
| --------------------------------- | --------------------------- |
| `evals/runner.ts`                 | Test harness entry point    |
| `evals/fixtures/`                 | Input test cases            |
| `evals/goldens/`                  | Expected outputs            |
| `evals/scripts/update-goldens.ts` | Explicit golden update tool |

### P3: Future (Do NOT Build Yet)

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

| Column                  | Type        | Notes                                                |
| ----------------------- | ----------- | ---------------------------------------------------- |
| `id`                    | uuid        | PK                                                   |
| `invocation_id`         | text        | NOT NULL, UNIQUE (idempotency key per LLM call)      |
| `request_id`            | text        | NOT NULL (multiple rows per request allowed)         |
| `trace_id`              | text        | NOT NULL (from explicit root span)                   |
| `langfuse_trace_id`     | text        | Nullable, debug URL                                  |
| `litellm_call_id`       | text        | Nullable, join to /spend/logs                        |
| `prompt_hash`           | text        | NOT NULL, SHA-256 of canonical payload               |
| `router_policy_version` | text        | NOT NULL, semver or git SHA                          |
| `graph_run_id`          | text        | Nullable (identifies graph execution within request) |
| `graph_name`            | text        | Nullable (null = direct LLM call)                    |
| `graph_version`         | text        | Nullable, git SHA                                    |
| `provider`              | text        | NOT NULL, e.g., "openai", "anthropic"                |
| `model`                 | text        | Resolved model ID                                    |
| `tokens_in`             | int         | Nullable                                             |
| `tokens_out`            | int         | Nullable                                             |
| `tokens_total`          | int         | Nullable                                             |
| `provider_cost_usd`     | numeric     | Nullable                                             |
| `latency_ms`            | int         | Call duration                                        |
| `status`                | text        | "success" / "error"                                  |
| `error_code`            | text        | Nullable                                             |
| `created_at`            | timestamptz |                                                      |

**Uniqueness:** `UNIQUE(invocation_id)` — UUID generated per LLM call attempt serves as idempotency key (better than `request_id + litellm_call_id` since `litellm_call_id` is null on errors).

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

### 1. Graph & AI Component Location

| Component            | Location                                     | Rationale                                 |
| -------------------- | -------------------------------------------- | ----------------------------------------- |
| LangGraph graphs     | `src/features/<feature>/ai/graphs/`          | Feature-scoped; pure logic, no IO         |
| Prompt templates     | `src/features/<feature>/ai/prompts/`         | Versioned text files                      |
| Tool contracts       | `src/features/<feature>/ai/tools/` (default) | Feature-scoped schemas                    |
| Tool implementations | `src/adapters/tools/`                        | IO + policy + instrumentation             |
| Route handlers       | `src/app/`                                   | Thin entrypoints calling feature services |

**Graphs start in feature slices.** Packages are NOT required for LangGraph. See [LANGGRAPH_AI.md](LANGGRAPH_AI.md).

### 2. Package Warrant Principles

Create packages only when criteria are met:

| Criterion                  | When to Package                                      |
| -------------------------- | ---------------------------------------------------- |
| **Cross-repo stability**   | Node + Operator need same contract (post-split)      |
| **Multi-deployable reuse** | Same code consumed by 2+ services without divergence |
| **Boundary enforcement**   | Hard isolation needed (no IO imports)                |

**Do NOT package:**

- Graphs before proven cross-service reuse
- Tool contracts used by single feature
- Patterns used only once

### 3. Tool Structure

**Per-tool files:**

- `src/features/<feature>/ai/tools/<tool>.tool.ts` - Contract: name, schema (Zod), typed handler interface
- `src/adapters/tools/<tool>.impl.ts` - Implementation: IO, policy checks, instrumentation

**Single registry:**

- `src/features/ai/tool-registry.ts` - Binds tool contracts to implementations (DI wiring)

**Drift guardrail:** If a tool contract is used by 2+ features or any Operator service, move to shared location (`src/shared/ai/contracts/` or package post-split).

**Ports guidance:** One port per external system, NOT per tool.

| Port              | Backs Tools            |
| ----------------- | ---------------------- |
| `KnowledgePort`   | RAG search, doc lookup |
| `WebResearchPort` | Web search, URL fetch  |
| `RepoPort`        | Code search, file read |
| `McpPort`         | MCP server calls       |

**Anti-patterns:**

- One port interface per tool when multiple tools hit same backend
- Putting IO inside graph/tool definitions
- Tool contracts without schemas (breaks evals)

### 4. Correlation Flow

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

### 5. Eval Harness Requirements

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
2. **No graphs in routes** - Routes stay thin; graphs live in feature slices and must not import IO/adapters
3. **No LiteLLM-only telemetry** - Always have local summary fallback + correlation IDs
4. **No port-per-tool** - Ports per external system, tools compose on top
5. **No IO in graphs** - Tool contracts define schemas; implementations live in adapters
6. **No premature packaging** - Package only after proven cross-service reuse (see Package Warrant Principles)

---

## Related Docs

- [LANGGRAPH_AI.md](LANGGRAPH_AI.md) - LangGraph architecture, port definitions, flow diagrams
- [AI_EVALS.md](AI_EVALS.md) - Eval harness structure, CI gates
- [PACKAGES_ARCHITECTURE.md](PACKAGES_ARCHITECTURE.md) - Package creation rules
- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal layers

---

**Last Updated**: 2025-12-19
**Status**: P0 Complete, P1/P2 Design Approved (Feature-Centric Pivot)
