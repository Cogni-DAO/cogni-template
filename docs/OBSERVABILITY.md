# Observability: Structured Logging & Log Collection

**Status:** V1 complete (structured logging), V2 complete (Alloy + Grafana Cloud Loki)

**Purpose:** Centralized Pino logging with request context, stable event schemas, and Grafana Alloy forwarding to Grafana Cloud Loki for log aggregation and querying.

---

## 1. Implementation Checklist

### V1: Structured Logging Foundation

**Module Structure:**

- [x] `shared/observability/logging/logger.ts` - makeLogger, makeNoopLogger
- [x] `shared/observability/logging/redact.ts` - Security-sensitive paths
- [x] `shared/observability/logging/events.ts` - AI + Payments event schemas
- [x] `shared/observability/logging/helpers.ts` - logRequestStart/End/Error
- [x] `shared/observability/context/types.ts` - RequestContext + structural Clock
- [x] `shared/observability/context/factory.ts` - createRequestContext with reqId validation
- [x] `shared/observability/index.ts` - Unified entry point

**Container:**

- [x] Add `log: Logger` to Container interface
- [x] Singleton: `getContainer()` + `resetContainer()`
- [x] Startup log: `{ env, logLevel, pretty }`
- [x] Replace `createContainer()` calls with `getContainer()`

**AI Completion:**

- [x] Instrument `app/api/v1/ai/completion/route.ts` with request/error logging
- [x] Update `app/_facades/ai/completion.server.ts` to accept/enrich ctx
- [x] Update `features/ai/services/completion.ts` to log LLM calls with AiLlmCallEvent
- [x] Remove console.log/error calls

**Tests:**

- [x] Update container.spec.ts for singleton pattern
- [x] Update facade/feature tests to pass ctx parameter
- [x] All tests use makeNoopLogger()
- [x] Remove console.log from adapters (DB, LiteLLM, Fake)

**Payments Routes (Phase 2 - Complete):**

- [x] `bootstrap/http/wrapRouteHandlerWithLogging.ts` - Route logging wrapper (envelope only)
- [x] `shared/observability/logging/helpers.ts` - Add logRequestWarn for 4xx errors
- [x] `app/_facades/payments/attempts.server.ts` - Accept ctx parameter (ready for downstream context passing)
- [x] `app/_facades/payments/credits.server.ts` - Accept ctx parameter (ready for downstream context passing)
- [x] `app/api/v1/payments/intents/route.ts` (routeId: "payments.intents")
- [x] `app/api/v1/payments/credits/summary/route.ts` (routeId: "payments.credits_summary")
- [x] `app/api/v1/payments/credits/confirm/route.ts` (routeId: "payments.credits_confirm")
- [x] `app/api/v1/payments/attempts/[id]/route.ts` (routeId: "payments.attempt_status")
- [x] `app/api/v1/payments/attempts/[id]/submit/route.ts` (routeId: "payments.attempt_submit")

---

### V2: Log Collection (Complete)

- [x] Wire Grafana Alloy scrape config for Docker containers (Promtail replacement)
- [x] Configure Docker socket mounts + container allowlist
- [x] Add JSON pipeline stages (Docker log parsing + timestamp extraction)
- [x] Validate logs in Loki (smoke queries passed)
- [x] Configure strict label cardinality (app, env, service, stream)
- [ ] Create Grafana dashboards (deferred)
- [ ] Add alerting rules (deferred)

**Implementation:** See [ALLOY_LOKI_SETUP.md](ALLOY_LOKI_SETUP.md) for complete setup guide.

---

## 2. Architecture

**Observability Layer:** `src/shared/observability/`

- Cross-cutting concern (logging, context, events)
- Imports allowed: `@/shared/auth`, `@/shared/env`
- Imports prohibited: `@/ports`, `@/bootstrap`, `@/core`, `@/features`
- Structural Clock: `{ now(): string }` - ports/Clock satisfies this

**RequestContext:**

- Type: `{ log, reqId, session?, clock }`
- Factory: `createRequestContext({ baseLog, clock }, request, { routeId, session })`
- No Container dependency - decouples from DI graph

**Container Integration:**

- Exports `log: Logger` in Container interface
- Routes call `getContainer()` for singleton
- Pass `{ baseLog: container.log, clock: container.clock }` to createRequestContext

**Route Envelope Logging:**

- `bootstrap/http/wrapRouteHandlerWithLogging` - Wrapper for route logging boilerplate
- Handles ctx creation, session check, timing, logRequestStart/End/Error
- Routes use wrapper to eliminate manual boilerplate
- Domain events (PaymentsEvent, AiEvent) stay in facades/features

**Ports Stay Pure:**

- No Logger in port interfaces (e.g., LlmService)
- Logging at feature layer before/after port calls
- Adapters remain testable without mock loggers

**Logging Pipeline (JSON-Only Architecture):**

- **App emits:** JSON to stdout (always, all environments)
- **No worker transports:** No pino-pretty in runtime (prevents worker thread crashes)
- **Dev formatting:** Optional external pipe (`pnpm dev:pretty | pino-pretty -S`)
- **Alloy scrapes:** JSON logs from Docker stdout
- **Alloy labels:** Adds `env` label from `DEPLOY_ENVIRONMENT` (not in app logs)
- **Fail-closed:** Alloy drops logs if `DEPLOY_ENVIRONMENT` ∉ {local, preview, production}

**Invariants:**

- App never conditionally formats logs (no transport switching)
- `env` label is single source of truth (Alloy only, not app)
- Tests stay silent (`enabled: false` when VITEST=true or NODE_ENV=test)

---

## 3. Key Files

**Observability Module:**

- `src/shared/observability/logging/logger.ts` - Logger factory
- `src/shared/observability/logging/events.ts` - Event schemas (AiLlmCallEvent, PaymentsEvent)
- `src/shared/observability/logging/helpers.ts` - logRequestStart/End/Error
- `src/shared/observability/context/factory.ts` - createRequestContext (reqId validation)
- `src/shared/observability/context/types.ts` - RequestContext + structural Clock

**Container:**

- `src/bootstrap/container.ts` - Singleton with logger
- `src/bootstrap/http/wrapRouteHandlerWithLogging.ts` - Route logging wrapper

**Instrumented Routes:**

- `src/app/api/v1/ai/completion/route.ts` - Request/error logging
- `src/app/_facades/ai/completion.server.ts` - Context enrichment
- `src/features/ai/services/completion.ts` - LLM call event logging

**Tests:**

- `tests/unit/bootstrap/container.spec.ts` - Singleton pattern tests
- `tests/unit/features/ai/services/completion.test.ts` - Feature tests with ctx
- `tests/setup.ts` - Sets `VITEST=true` to suppress logs

**Log Collection Infrastructure:**

- `platform/infra/services/runtime/configs/alloy-config.alloy` - Alloy log scraper config
- `platform/infra/services/runtime/docker-compose.yml` - Alloy service (forwards to Grafana Cloud)

---

## 4. Log Collection & Querying

**Architecture:** Application (JSON stdout) → Docker → Alloy → Loki (local or cloud)

**Components:**

- **Application**: Emits JSON-only logs to stdout (no conditional formatting)
- **Grafana Alloy v1.9.2**: Scrapes Docker container logs, applies labels + validation, forwards to Loki
- **Loki**: Local (dev) or Grafana Cloud (preview/prod) for log storage and querying
- **Container Allowlist**: Only collects logs from `app|litellm|caddy` services
- **Fail-Closed Validation**: Alloy drops logs if `DEPLOY_ENVIRONMENT` ∉ {local, preview, production}

**Labels (indexed, low-cardinality):**

- `app="cogni-template"` - Application identifier
- `env="local"|"preview"|"production"` - Environment from `DEPLOY_ENVIRONMENT`
- `service="app"|"litellm"|"caddy"` - Docker Compose service name
- `stream="stdout"|"stderr"` - Log stream type

**High-cardinality fields** (in JSON body, not labels):

- `reqId`, `userId`, `billingAccountId`, `attemptId`, `level`, `msg`, `time`

**Access:**

- **Alloy UI**: http://127.0.0.1:12345 (targets, component status)
- **Grafana Cloud**: https://your-org.grafana.net (log browser, dashboards, alerts)

**Example LogQL Queries (in Grafana Cloud):**

```logql
# Count all logs in last 5 minutes
count_over_time({app="cogni-template"}[5m])

# Query app logs with error level
{service="app"} | json | level="error"

# Trace specific request by reqId
{service="app"} | json | reqId="abc123"
```

**Configuration:**

**Environment Variables:**

- `DEPLOY_ENVIRONMENT` - Deployment identity for observability labels (`local` | `preview` | `production`)
- `APP_ENV` - Adapter selection for test fakes vs real implementations (`test` | `production`)
- `LOKI_WRITE_URL` - Loki push endpoint
  - Local dev: `http://loki:3100/loki/api/v1/push`
  - Cloud: `https://logs-prod-*.grafana.net/loki/api/v1/push`
- `LOKI_USERNAME` - Loki basic auth user (empty for local, numeric ID for cloud)
- `LOKI_PASSWORD` - Loki basic auth password (empty for local, API key for cloud)

**Infrastructure:**

- Alloy listens on `0.0.0.0:12345` in-container, bound to `127.0.0.1` on host
- Promtail deprecated (EOL March 2, 2026)
- Single parameterized Alloy config for all environments (no config drift)

**Setup Instructions:**

### Local Development Setup

1. **Start Dev Stack**:
   - `pnpm dev:stack` - JSON logs (raw stdout)
   - `pnpm dev:stack:pretty` - Pretty formatted logs (piped to pino-pretty)
2. **Services Included**:
   - Local Loki on http://localhost:3100
   - Local Grafana on http://localhost:3001 (anonymous admin access enabled)
   - Alloy writes to local Loki (no cloud credentials needed)
3. **Query Logs**:
   - Open Grafana: http://localhost:3001
   - Navigate to Explore → Loki datasource
   - Query: `{app="cogni-template", env="local"}`
4. **MCP Access**: Use `grafana-local` MCP server (connects via Docker network)
5. **Log Format**:
   - App always emits JSON to stdout
   - Use `pnpm dev:pretty` to pipe through pino-pretty for readable logs
   - Use `pnpm dev` for raw JSON (better for debugging structured fields)

### Preview/Production Setup (Grafana Cloud)

1. **Create Grafana Cloud Account**: Sign up at https://grafana.com/products/cloud/ (free tier available)
2. **Get Loki Credentials**:
   - Navigate to: Grafana Cloud → Connections → Data Sources → Loki
   - Copy the URL (e.g., `https://logs-prod-us-central1.grafana.net/loki/api/v1/push`)
   - Copy your User ID (numeric value)
   - Generate an API key with `logs:write` permission
3. **Set Environment Variables**:
   - Add to deployment `.env` file or CI/CD secrets
   - Required: `DEPLOY_ENVIRONMENT`, `LOKI_WRITE_URL`, `LOKI_USERNAME`, `LOKI_PASSWORD`
4. **Deploy Stack**: `docker compose up -d`
5. **Verify**:
   - Check Alloy UI: http://127.0.0.1:12345 → verify `loki` endpoint healthy
   - Query logs in Grafana Cloud Explore: `{app="cogni-template", env="preview"}` or `{app="cogni-template", env="production"}`

**Benefits of Grafana Cloud:**

- **No infrastructure management**: Grafana handles storage, scaling, updates
- **Built-in dashboards**: Grafana Cloud UI for log exploration and visualization
- **Automatic updates**: Always latest Loki features without manual upgrades
- **Reduced container footprint**: No self-hosted Loki service required
- **Better reliability**: Managed service with SLA and automatic backups

---

## 5. Invariants

**Boundary:**

- `observability/` has no imports from `ports/`, `bootstrap/`, `core/`, `features/`
- Structural Clock interface prevents port dependency
- RequestContext factory takes `{ baseLog, clock }` not Container

**Wiring:**

- Container is module singleton (one logger per process)
- Routes import from `@/shared/observability` not `@/bootstrap/container`
- Ports stay pure (no Logger in port interfaces)

**Logging:**

- Every route: logRequestStart() at entry, logRequestEnd() on all exit paths
- Errors: logRequestError() with stable errorCode + { err } object
- Events: Typed schemas (AiLlmCallEvent, PaymentsEvent) with consistent fields
- Security: reqId validated (max 64 chars, alphanumeric + `_-`)

**Test Silence:**

- makeLogger() checks `VITEST=true || NODE_ENV=test` (VITEST is canonical test-runner signal)
- Silences logs regardless of APP_ENV (which controls adapter wiring only)
- Container tests can set APP_ENV=production to test real adapters without log noise
- All console.log/warn removed from adapters (policy: no console.\* in src/)

---

## 6. Event Schemas

**HTTP Request Events:**

- `logRequestStart(ctx.log)` → `{ reqId, route, method, msg: "request received" }`
- `logRequestEnd(ctx.log, { status, durationMs })` → info/warn/error by status
- `logRequestError(ctx.log, error, errorCode)` → `{ err, errorCode }`

**AI Domain:**

- `AiLlmCallEvent` → `{ event: "ai.llm_call", routeId, reqId, billingAccountId, model?, durationMs, tokensUsed?, providerCostUsd? }`

**Payments Domain:**

- `PaymentsIntentCreatedEvent` → `{ event: "payments.intent_created", routeId, reqId, attemptId, chainId, durationMs }`
- `PaymentsStateTransitionEvent`, `PaymentsVerifiedEvent`, `PaymentsConfirmedEvent` → Similar schema

**Location:** `src/shared/observability/logging/events.ts`

---

## 7. Security

**Redaction:**

- Paths: password, token, apiKey, authorization, cookie, privateKey, mnemonic
- Location: `src/shared/observability/logging/redact.ts`
- Important: Does NOT redact "url" globally (preserves queryability)

**ReqId Validation:**

- Max 64 chars, `/^[a-zA-Z0-9_-]+$/`
- Prevents log injection via `x-request-id` header
- Location: `src/shared/observability/context/factory.ts:21-37`

---

## 8. Known Issues & Future Work

**Phase 2 Complete - Remaining V1 Work:**

- [ ] Payment facades accept `_ctx` but don't yet use it; rename `_ctx` → `ctx` and use for:
  - Child logger enrichment with `billingAccountId`
  - Domain event logging (PaymentsIntentCreatedEvent, etc.)
  - Requires feature services to accept RequestContext parameter (Phase 3)
- [ ] Replace `throw new Error('AUTH_USER_NOT_FOUND')` with typed error class for reliable route mapping
- [ ] AI completion route: migrate to `wrapRouteHandlerWithLogging` + local error mapper (consistent with payment routes)

**V2 Complete:**

- [x] Wire Grafana Alloy scrape config (replace Promtail)
- [x] Validate Loki pipeline
- [x] Configure strict label cardinality

**Future Enhancements:**

- [ ] Grafana dashboards (query builder, log browser)
- [ ] Alerting rules (error rate spikes, payment failures)
- [ ] Advanced filtering (drop health check logs, metrics endpoints)
- [ ] Structured metadata extraction (high-cardinality fields)
