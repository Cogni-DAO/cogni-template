# Observability

**Status:** Structured logging + Loki collection operational; client logs not collected; no Prometheus metrics (yet)

**Purpose:** JSON logging with event registry enforcement, shipped via Alloy to Grafana Cloud Loki for production debugging.

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

- `platform/infra/services/runtime/configs/alloy-config.alloy` - Log scraper config
- `platform/infra/services/runtime/docker-compose.yml` - Alloy + Loki services
- `.mcp.json` - Grafana MCP servers for log querying

---

## Logging Contract

**Cardinal Rules:**

- All event names MUST be in EVENT_NAMES registry (prevents ad-hoc strings)
- All events MUST include reqId (enforced by logEvent(), fail-closed)
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

**High-cardinality fields** (in JSON, not labels): `reqId`, `userId`, `billingAccountId`, `model`, `time`

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

## Current Shortcomings

**Not Yet Implemented:**

- ❌ Client logs not collected (console-only, no shipping pipeline)
- ❌ No Prometheus metrics (http_requests_total, ai_llm_duration_ms, etc.)
- ❌ No Grafana dashboards
- ❌ No alerting rules

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

## References

- [ALLOY_LOKI_SETUP.md](ALLOY_LOKI_SETUP.md) - Complete infrastructure setup
- [Observability Guide](.claude/commands/logging.md) - Developer guidelines
- Grafana Cloud: https://grafana.com/products/cloud/
- Loki docs: https://grafana.com/docs/loki/
