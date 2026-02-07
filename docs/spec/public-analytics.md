---
id: public-analytics-spec
type: spec
title: Public Analytics Page
status: draft
spec_state: draft
trust: draft
summary: Public transparency page at /analytics with aggregated platform metrics, k-anonymity suppression, and server-side query allowlist
read_when: Working on public analytics, metrics display, or Mimir/Prometheus query integration
implements:
owner: derekg1729
created: 2025-12-04
verified:
tags: [data, observability, analytics]
---

# Public Analytics Page

## Context

The platform needs a public transparency page showing aggregated usage metrics (requests, tokens, error rates, latency, model distribution). Metrics flow from the app via Alloy `remote_write` to Grafana Cloud Mimir, then the app queries Mimir for aggregated data. Privacy is enforced through k-anonymity suppression, fixed query windows, and server-side query allowlists.

Backend implementation is complete (infrastructure, label audit, hexagonal architecture, tests). Frontend is tracked in [ini.observability-hardening.md](../../work/initiatives/ini.observability-hardening.md).

## Goal

Provide a public `/analytics` endpoint and page that displays aggregated platform metrics with enforceable privacy guarantees — no user-level data, no arbitrary queries, no PII leakage.

## Non-Goals

- **Per-user analytics** — never
- **Cost/billing data** — never expose `ai_llm_cost_usd_total` publicly
- **Real-time streaming** — 60s cache is sufficient
- **Arbitrary date ranges** — fixed windows prevent correlation attacks
- **Export/download** — display-only, no CSV/JSON export

## Core Invariants

1. **FIXED_QUERY_WINDOWS**: Only 7d/30d/90d windows accepted. No arbitrary time ranges. Use `/api/v1/query_range` with `step` = bucket size. Use `increase(counter[bucket])` for timeseries — **never** `rate(counter[7d])`.

2. **SERVER_SIDE_ALLOWLIST**: No client-controlled PromQL, label filters, or time ranges. `env` hardcoded server-side from `DEPLOY_ENVIRONMENT`. All queries include `route!="meta.metrics"` to exclude scraper traffic and `env="${ENV}"` for environment isolation.

3. **K_ANONYMITY_SUPPRESSION**: K = 50 (configurable via `ANALYTICS_K_THRESHOLD`). Suppress each bucket pointwise where `requestCount < K` → return `null`. All numeric values in API response are nullable — `null` indicates suppression. Denominator = `sum(increase(http_requests_total{app,env,route!="meta.metrics"}[bucket]))`.

4. **LABEL_HYGIENE**: Only low-cardinality labels allowed: `app`, `env`, `route` (template), `method`, `status` (bucket), `provider`, `model_class`, `code`. Forbidden: `user_id`, `wallet`, `api_key`, `virtual_key`, `reqId`, `ip`, `user_agent`, raw paths with IDs or query params.

5. **METRICS_SCRAPE_EXCLUSION**: `/api/metrics` is server-to-server only (Alloy scraping) — never exposed to browser. Scraper traffic excluded from `http_requests_total` via `routeId === "meta.metrics"` check.

6. **SEPARATE_CREDENTIALS**: Write path (Alloy → Mimir) and read path (app → Mimir) use separate auth tokens for least privilege.

## Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    /app/(public)/analytics/page.tsx             │
└───────────────────────────────┬─────────────────────────────────┘
                                │ React Query (SWR 60s)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                /api/v1/analytics/summary/route.ts               │
│   • Rate limit: 10 req/min/IP                                   │
│   • Cache: 60s server + stale-while-revalidate                  │
│   • Input: window=7d|30d|90d (enum only)                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              /features/analytics/services/analytics.ts          │
│   • QUERY_ALLOWLIST: predefined PromQL only                     │
│   • K-anonymity suppression (K=50)                              │
│   • Timeout: 5s per query                                       │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP (Prometheus Query API)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Grafana Cloud Mimir                          │
└─────────────────────────────────────────────────────────────────┘
```

### Backend Implementation (as-built)

Hexagonal architecture with port/adapter pattern:

- **Port:** `src/ports/metrics-query.port.ts` (`MetricsQueryPort` interface)
- **Adapter:** `src/adapters/server/metrics/mimir.adapter.ts` (Mimir HTTP queries)
- **Test double:** `src/adapters/test/metrics/fake-metrics.adapter.ts`
- **Container wiring:** `src/bootstrap/container.ts` (environment-based adapter selection)
- **Contract:** `src/contracts/analytics.summary.v1.contract.ts` (Zod schemas)
- **Service:** `src/features/analytics/services/analytics.ts` (k-anonymity logic)
- **Facade:** `src/app/_facades/analytics/summary.server.ts` (type mapping)
- **Route:** `src/app/api/v1/analytics/summary/route.ts` (HTTP endpoint with caching)

Endpoint: `GET /api/v1/analytics/summary?window={7d|30d|90d}`

### API Contract

**File:** `src/contracts/analytics.summary.v1.contract.ts`

**Input:** `{ window: "7d" | "30d" | "90d" }` — enum only, default "7d"

**Output shape:**

- `window`, `generatedAt`, `cacheTtlSeconds`
- `summary`: `totalRequests`, `totalTokens`, `errorRatePercent`, `latencyP50Ms`, `latencyP95Ms` — all `number | null`
- `timeseries`: `requestRate`, `tokenRate`, `errorRate` — arrays of `{ timestamp, value: number | null }`
- `distribution.modelClass`: `{ free, standard, premium }` — all `number | null`

### Fixed Windows — Query Bucketing

| Window | Bucket | Step | Max Datapoints |
| ------ | ------ | ---- | -------------- |
| 7d     | 1h     | 1h   | 168            |
| 30d    | 6h     | 6h   | 120            |
| 90d    | 1d     | 1d   | 90             |

For `histogram_quantile()`: use `rate(...[5m])` (short range), chart granularity controlled by `step`.

### Server-Side Query Patterns

| Metric             | Pattern                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Requests           | `sum(increase(http_requests_total{app,env,route!="meta.metrics"}[bucket]))`                             |
| Tokens             | `sum(increase(ai_llm_tokens_total{app,env}[bucket]))`                                                   |
| Error rate         | `sum(increase(...status="5xx"...)) / sum(increase(...))`                                                |
| Latency p95        | `histogram_quantile(0.95, sum(rate(..._bucket{app,env}[5m])) by (le))` via query_range with step=bucket |
| Model distribution | `sum by (model_class) (increase(ai_llm_tokens_total{app,env}[bucket]))`                                 |

### Metrics Infrastructure (as-built)

- **Env label:** `metricsRegistry.setDefaultLabels({ app: "cogni-template", env: process.env.DEPLOY_ENVIRONMENT ?? "local" })` — preview and production distinguishable
- **Scraper exclusion:** `wrapRouteHandlerWithLogging.ts` skips metrics recording when `routeId === "meta.metrics"`
- **Scrape timeout:** Alloy config `scrape_timeout = "10s"`
- **Label audit:** All labels low-cardinality only (`route`, `method`, `status`, `provider`, `model_class`, `code`). No user/wallet/key/reqId labels.

### Caching & Rate Limiting

| Layer          | Setting                                                         |
| -------------- | --------------------------------------------------------------- |
| Server headers | `Cache-Control: public, max-age=60, stale-while-revalidate=300` |
| React Query    | `staleTime: 60s`, `gcTime: 5min`, `refetchInterval: 60s`        |
| Caddy          | 10 req/min per IP on `/api/v1/analytics/*`                      |

### Environment Variables

| Variable                      | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `PROMETHEUS_REMOTE_WRITE_URL` | Grafana Cloud write endpoint (must end with /api/prom/push) |
| `PROMETHEUS_USERNAME`         | Write path: basic auth username (Alloy)                     |
| `PROMETHEUS_PASSWORD`         | Write path: basic auth password (write-only token)          |
| `PROMETHEUS_QUERY_URL`        | Read path: explicit query endpoint (or derived from write)  |
| `PROMETHEUS_READ_USERNAME`    | Read path: basic auth username (app queries)                |
| `PROMETHEUS_READ_PASSWORD`    | Read path: basic auth password (read-only token)            |
| `ANALYTICS_K_THRESHOLD`       | K-anonymity threshold (default: 50)                         |
| `ANALYTICS_QUERY_TIMEOUT_MS`  | Query timeout (default: 5000)                               |

### Standards

- `/api/metrics` is server-to-server only (Alloy scraping) — never expose to browser
- Use Grafana Cloud Metrics (Mimir) as time-series DB via Alloy `remote_write`
- Public analytics: aggregated data only (counts, rates, distributions)
- Cache summaries (60s), rate-limit public endpoints (10 req/min/IP)

### Anti-patterns

- Do not parse Prometheus text format in browser
- Do not store historical metrics in app process memory
- Do not expose per-user, per-request, or billing data on public pages
- Do not accept arbitrary PromQL, time ranges, or label filters from clients
- Do not return data for buckets with <50 underlying events (k-anonymity)

### File Pointers

| File                                                             | Purpose                    |
| ---------------------------------------------------------------- | -------------------------- |
| `src/ports/metrics-query.port.ts`                                | MetricsQueryPort interface |
| `src/adapters/server/metrics/mimir.adapter.ts`                   | Mimir query adapter        |
| `src/adapters/test/metrics/fake-metrics.adapter.ts`              | Test double                |
| `src/contracts/analytics.summary.v1.contract.ts`                 | Zod schemas                |
| `src/features/analytics/services/analytics.ts`                   | K-anonymity + query logic  |
| `src/app/_facades/analytics/summary.server.ts`                   | Type mapping facade        |
| `src/app/api/v1/analytics/summary/route.ts`                      | HTTP endpoint              |
| `src/shared/observability/server/metrics.ts`                     | Metrics registry + labels  |
| `src/shared/observability/server/wrapRouteHandlerWithLogging.ts` | Scraper exclusion          |

## Acceptance Checks

**Automated:**

- Unit tests for k-anonymity suppression (pointwise null check)
- Contract tests for analytics summary schema
- Adapter tests for Mimir query timeout handling
- PII denylist validation in test suite

**Manual:**

| Requirement                                               | Verification                          |
| --------------------------------------------------------- | ------------------------------------- |
| Timeseries changes when real traffic changes, not scraper | Query excludes `route="meta.metrics"` |
| Preview and production charts are disjoint                | `env` filter hardcoded server-side    |
| Low-activity buckets (<50 requests) are null-suppressed   | Unit test k-anonymity pointwise       |
| No client-controlled PromQL, labels, or time ranges       | Only `window` enum accepted           |
| No user identifiers in responses                          | Query allowlist excludes user labels  |
| Cache 60s+, rate limit 10/min                             | Response headers + Caddy config       |

## Open Questions

- [ ] Metrics label coupling: Alloy config labels (`app`, `env`) must match `mimir.adapter.ts` PromQL selectors and `ai-tools/metrics-query` tool description. No shared catalog yet — manual sync required.

## Related

- [observability.md](./observability.md) — structured logging, tracing
- [activity-metrics.md](./activity-metrics.md) — activity dashboard design
- [ini.observability-hardening.md](../../work/initiatives/ini.observability-hardening.md) — frontend roadmap (Public Analytics Frontend Track)
