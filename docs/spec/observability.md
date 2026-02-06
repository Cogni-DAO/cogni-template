---
id: observability-spec
type: spec
title: Observability
status: active
trust: draft
summary: JSON logging with event registry, Prometheus metrics, and Alloy shipping to Grafana Cloud
read_when: Implementing logging, metrics, or debugging production issues
owner: derekg1729
created: 2026-02-05
verified: 2026-02-05
tags: [observability]
---

# Observability

**Status:** Structured logging + Loki collection operational; Prometheus metrics operational; client logs not collected

**Purpose:** JSON logging with event registry enforcement + Prometheus metrics, shipped via Alloy to Grafana Cloud Loki/Mimir for production debugging and dashboards.

---

## Architecture

src/shared/observability/
├── events/
│ ├── index.ts # EVENT_NAMES registry + EventName + EventBase
│ ├── ai.ts # AiLlmCallEvent (strict payload)
│ └── payments.ts # Payment event payloads (strict)
├── server/ # Pino-based (was logging/)
│ ├── logger.ts # Factory only
│ ├── logEvent.ts # Type-safe wrapper
│ └── helpers.ts # Request lifecycle
└── client/ # Console-based (no shipping)
├── logger.ts # Browser logger
└── index.ts

**Flow:** App (JSON stdout) → Docker → Alloy → Loki (local dev or cloud)

**Environments:**

- `local` - Docker stack with local Loki (http://localhost:3001)
- `preview` - Staging deploys → Grafana Cloud
- `production` - Live deploys → Grafana Cloud
- `ci` - GitHub Actions → Grafana Cloud

---

## Key Files

**Event Registry (single source of truth):**

- `src/shared/observability/events/index.ts` - EVENT_NAMES as const, EventName union, EventBase interface
- `src/shared/observability/events/ai.ts` - Strict payload types for AI domain (AiLlmCallEvent)
- `src/shared/observability/events/payments.ts` - Strict payload types for payments domain

**Server Logging:**

- `src/shared/observability/server/logger.ts` - Pino factory (sync mode, zero buffering)
- `src/shared/observability/server/logEvent.ts` - Type-safe event logger (enforces reqId + event name from registry)
- `src/shared/observability/server/helpers.ts` - logRequestStart/End/Error wrappers

**Client Logging:**

- `src/shared/observability/client/logger.ts` - Browser console logger (uses EVENT_NAMES registry, no shipping)

**Context:**

- `src/shared/observability/context/` - RequestContext factory with reqId validation

**Infrastructure:**

- `platform/infra/services/runtime/configs/alloy-config.alloy` - Logs only (local dev)
- `platform/infra/services/runtime/configs/alloy-config.metrics.alloy` - Logs + metrics (preview/prod)
- `platform/infra/services/runtime/docker-compose.yml` - Prod stack (uses metrics config)
- `platform/infra/services/runtime/docker-compose.dev.yml` - Dev stack (uses logs-only config)
- `.mcp.json` - Grafana MCP servers for log querying

---

## Logging Contract

**Cardinal Rules:**

- All event names MUST be in EVENT_NAMES registry (prevents ad-hoc strings)
- All server events MUST include `reqId` (enforced by logEvent(), fail-closed)
- All server events MUST include `traceId` (from OTel root span)
- AI events SHOULD include `litellmCallId` and `langfuseTraceId` when available
- No sensitive payloads (prompts, request bodies, secrets, PII)
- 2-6 events per request max
- Every operation has deterministic terminal outcome (success OR failure)

**Event Naming Convention:**

- Server: `ai.*`, `payments.*`, `adapter.*`, `inv_*`
- Client: `client.ai.*`, `client.payments.*`

**Streaming Events:**

- Split durations: `handlerMs` (until Response returned), `streamMs` (until stream closed)
- Deterministic terminal: exactly one of `ai.llm_call_completed` OR `ai.chat_stream_finalization_lost` (15s timeout)
- Client abort: `cancel()` handler logs `ai.chat_client_aborted`

---

## Labels (Indexed, Low-Cardinality)

- `app="cogni-template"` - Always
- `env="local|preview|production|ci"` - From DEPLOY_ENVIRONMENT
- `service="app|litellm|caddy|deployment"` - Docker service name
- `stream="stdout|stderr"` - Log stream

**High-cardinality fields** (in JSON, NOT labels): `reqId`, `traceId`, `spanId`, `langfuseTraceId`, `litellmCallId`, `userId`, `billingAccountId`, `model`, `time`

---

## Context Propagation

`reqId` and trace context propagate through all adapters, tools, and graphs:

- `reqId` attached as OTel span attribute (`cogni.request_id`)
- `reqId` + `traceId` forwarded in LiteLLM metadata for correlation
- Child loggers inherit `reqId` + `traceId` from RequestContext

---

## Usage

**Server Logging:**

```typescript
import { EVENT_NAMES, logEvent } from "@/shared/observability";

ctx.log.info(
  { reqId: ctx.reqId, model: "gpt-5", streamMs: 1234 },
  EVENT_NAMES.AI_CHAT_STREAM_CLOSED
);

// Or with logEvent for type safety:
logEvent(ctx.log, EVENT_NAMES.AI_CHAT_RECEIVED, {
  reqId: ctx.reqId,
  userId,
  stream: true,
  requestedModel: "gpt-5",
  messageCount: 3,
});
```

**Client Logging:**

```typescript
import { clientLogger, EVENT_NAMES } from "@/shared/observability";

clientLogger.warn(EVENT_NAMES.CLIENT_CHAT_STREAM_ERROR, { messageId });
```

**LogQL Queries:**

```logql
# All production errors
{app="cogni-template", env="production", service="app"} | json | level="error"

# Trace specific request
{service="app"} | json | reqId="abc-123"

# AI calls
{service="app"} | json | event="ai.llm_call_completed"
```

---

## Metrics (Prometheus-format)

**Purpose:** Alertable numeric signals (rates/latency/tokens/cost) complementary to logs.

**Flow:** App (`GET /api/metrics`) → Alloy `prometheus.scrape` → Grafana Cloud Mimir

**Endpoint:** `GET /api/metrics` (Bearer auth required in production)

**Config:** `alloy-config.metrics.alloy` (preview/prod); `alloy-config.alloy` (local dev, logs-only)

**Registry:** `src/shared/observability/server/metrics.ts` - prom-client registry + metric definitions

**Recorded at:**

- HTTP: `wrapRouteHandlerWithLogging` - request count + handler duration (finally block)
- Chat SSE: `ai.chat_stream_closed` - stream duration
- LLM: `ai.llm_call_completed` + error paths - duration/tokens/cost/errors

**Core metrics:** `http_requests_total`, `http_request_duration_ms`, `ai_chat_stream_duration_ms`, `ai_llm_call_duration_ms`, `ai_llm_tokens_total`, `ai_llm_cost_usd_total`, `ai_llm_errors_total`

**Labels:** All low-cardinality—`route` (routeId), `method`, `status` (2xx/4xx/5xx), `provider`, `model_class` (free/standard/premium), `code` (`AiExecutionErrorCode` — pre-normalized, no heuristics)

**Error Metrics:** `ai_llm_errors_total` receives pre-normalized `AiExecutionErrorCode` from the completion layer. Metrics never introspect error objects or use string heuristics. See [ERROR_HANDLING_ARCHITECTURE.md](ERROR_HANDLING_ARCHITECTURE.md#ai-execution-errors).

---

## Current Shortcomings

**Critical (blocks incident detection) — see [Required Observability Spec](OBSERVABILITY_REQUIRED_SPEC.md):**

- ❌ No Node.js process metrics (`collectDefaultMetrics()` not called — heap/RSS/GC invisible)
- ❌ No heartbeat metric (app death indistinguishable from quiet period)
- ❌ No container resource limits in compose (unbounded memory → unattributable OOM kills)
- ❌ No Grafana alert rules (silent outages go undetected)
- ❌ No container restart/exit-code detection
- ❌ Dockerfile HEALTHCHECK timeout (2s) shorter than readyz budget (8s)
- ❌ `/readyz` skips database connectivity check

**Not Yet Implemented:**

- ❌ Client logs not collected (console-only, no shipping pipeline)
- ❌ No Grafana dashboards
- ❌ No OTel trace exporter (SDK initialized, no OTLP endpoint)

**Technical Debt:**

- Client code still uses old string literals (not EVENT_NAMES constants) - 27 TypeScript errors
- logEvent() created but not yet used (still using ctx.log.info directly)

---

## Key Invariants

1. **Event registry enforcement:** No new event names without updating EVENT_NAMES (prevents schema drift)
2. **Sync logging:** `pino.destination({ sync: true, minLength: 0 })` prevents delayed/buffered logs under SSE
3. **Fail-closed reqId:** logEvent() throws if reqId missing (never emit malformed events)
4. **No sensitive data:** Redact paths cover passwords, keys, tokens; never log prompts or full request bodies
5. **Streaming determinism:** Every SSE request emits exactly one terminal event (completed OR finalization_lost)

---

## Langfuse Integration (AI Trace Visibility)

**Purpose:** Langfuse is the canonical visibility surface for prompts/responses + tool usage + outcomes. Logs (Loki) contain only IDs/hashes; Langfuse contains scrubbed content for debugging.

**Architecture:** App creates trace (scrubbed I/O) via `ObservabilityGraphExecutorDecorator`; LiteLLM creates generation observations (full messages, tokens, latency) via its `success_callback: ["langfuse"]` integration. Generations attach to app trace via `existing_trace_id` in LiteLLM metadata.

### Langfuse Invariants

1. **LANGFUSE_NO_PROMPTS_IN_LOKI:** Prompts/responses only in Langfuse (scrubbed), never in Loki logs
2. **LANGFUSE_SCRUB_BEFORE_SEND:** All content passes through structured redaction before Langfuse transmission
3. **LANGFUSE_OTEL_TRACE_CORRELATION:** Use OTel `ctx.traceId` as Langfuse trace ID; validate 32-hex or fallback with correlation
4. **LANGFUSE_TERMINAL_ONCE_GUARD:** Exactly one terminal outcome per trace (success/error/aborted/finalization_lost); atomic guard prevents duplicates
5. **LANGFUSE_TOOL_SPANS_NOT_LOGS:** Tool executions create Langfuse spans, NOT log events (keep 2-4 events per request)
6. **LANGFUSE_SESSION_LIMIT:** sessionId <=200 chars; truncate or reject before sending
7. **LANGFUSE_USER_OPT_OUT:** Per-user `maskContent=true` sends hashes only (no readable content)
8. **LANGFUSE_PAYLOAD_CAPS:** Hard limits on trace/generation/tool span I/O size; exceeded => summary + hash + bytes only

### Trace Contract

| Field       | Source                                                  | Requirement                                                              |
| ----------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `id`        | `ctx.traceId` (OTel)                                    | 32-hex validated; fallback generates ID + stores otelTraceId in metadata |
| `sessionId` | `caller.sessionId`                                      | <=200 chars; truncate if exceeded                                        |
| `userId`    | `caller.userId`                                         | Stable internal ID (not email); in metadata, NOT as tag                  |
| `input`     | Scrubbed messages                                       | Non-null; last user message + structure (scrubbed)                       |
| `output`    | Scrubbed response                                       | Non-null; set on terminal outcome (scrubbed)                             |
| `tags`      | `[providerId, graphId, env]`                            | Low-cardinality only; NO userId                                          |
| `metadata`  | `{runId, reqId, graphId, providerId, billingAccountId}` | Correlation keys                                                         |

### Terminal States (exactly one per trace)

| State               | Condition                                  | Timer                                     |
| ------------------- | ------------------------------------------ | ----------------------------------------- |
| `success`           | `assistant_final` emitted before `done`    | —                                         |
| `error`             | Exception thrown or error event            | —                                         |
| `aborted`           | AbortSignal fired                          | —                                         |
| `finalization_lost` | 15s after `done` without `assistant_final` | Starts on `done`, cleared on any terminal |

### Scrubbing Policy

**Structured redaction (not regex-only):**

- Redact by key name: `token`, `secret`, `key`, `password`, `auth`, `cookie`, `bearer`
- Recurse objects with maxDepth limit
- Apply regex scrubs to string leaves (API keys, emails, cards)
- Always compute hash of raw serialized input for log correlation

**Payload limits:**

- Trace input/output: 50KB max; exceeded => `{summary, hash, bytes}`
- Generation input/output: 100KB max; exceeded => `{summary, hash, bytes}`
- Tool span input/output: 10KB max; exceeded => `{summary, hash, bytes}`

### Log Events (2-4 per request)

| Event                      | Fields                                     | When                   |
| -------------------------- | ------------------------------------------ | ---------------------- |
| `langfuse.trace_created`   | `reqId, traceId, langfuseTraceId, graphId` | On `runGraph()` start  |
| `langfuse.trace_completed` | `reqId, traceId, langfuseTraceId, outcome` | On terminal resolution |

**NOT logged:** Tool span creation/completion (visible in Langfuse UI only)

### Implementation Status

- [x] Add `LANGFUSE_TRACE_CREATED`, `LANGFUSE_TRACE_COMPLETED` to `EVENT_NAMES` (`src/shared/observability/events/index.ts`)
- [x] Create structured redaction utility (`src/shared/ai/langfuse-scrubbing.ts`)
- [x] Create `ObservabilityGraphExecutorDecorator` (`src/adapters/server/ai/observability-executor.decorator.ts`)
- [x] Add `startSpan()`, `updateTraceOutput()` to `LangfuseAdapter` (`src/adapters/server/ai-telemetry/langfuse.adapter.ts`)
- [x] Add span infrastructure to `createToolRunner()` (`@cogni/ai-core/tooling/tool-runner.ts`) — wiring deferred (tool visibility via generation messages)
- [x] Add `sessionId`, `userId`, `maskContent` to `LlmCaller` interface (`src/ports/llm.port.ts`)
- [x] Wire decorator in `graph-executor.factory.ts` (`src/bootstrap/graph-executor.factory.ts`)
- [x] Validate traceId format (32-hex) with fallback (`src/adapters/server/ai/observability-executor.decorator.ts`)
- [x] Add stack test: trace with non-null IO and terminal outcome (`tests/stack/ai/langfuse-observability.stack.test.ts`)

### Tool Span Payload Policy

**Invariant:** `@cogni/ai-core` emits metadata-only spans by default (toolCallId, toolName, effect, status, elapsedMs, errorCode). Raw args/results are never sent from ai-core.

**Adapter responsibility:** Langfuse adapter may attach scrubbed+size-capped payload via `spanInput`/`spanOutput` hooks. Adapters must enforce size caps + masking before sending.

**Open work:**

- [ ] Review tool-runner span scrubbing: ensure `spanInput`/`spanOutput` hooks are wired from composition root with langfuse-scrubbing functions
- [ ] Move `langfuse-scrubbing.ts` from `src/shared/ai/` to `src/adapters/observability/langfuse/` (adapter layer owns vendor-specific scrubbing)

### Langfuse API Verification

Query recent traces (requires `LANGFUSE_*` vars in `.env.local`):

```bash
pnpm langfuse:trace
```

---

## References

- [Required Observability Spec](OBSERVABILITY_REQUIRED_SPEC.md) - P0/P1 remediation plan for silent death detection
- [ALLOY_LOKI_SETUP.md](ALLOY_LOKI_SETUP.md) - Complete infrastructure setup
- [Observability Guide](.claude/commands/logging.md) - Developer guidelines
- Grafana Cloud: https://grafana.com/products/cloud/
- Loki docs: https://grafana.com/docs/loki/
