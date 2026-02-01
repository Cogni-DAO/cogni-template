# Metrics Observability Roadmap

See [OBSERVABILITY.md](./OBSERVABILITY.md) for current metrics implementation.

---

## Implementation Checklist — Public Analytics Page

> Status: Backend implementation finished. Frontend not started.

### Phase 1: Infrastructure Prerequisites — DONE

- [x] Deploy Grafana Cloud Metrics (Mimir) credentials to CI/CD
  - `staging-preview.yml:134` and `deploy-production.yml:112` pass `PROMETHEUS_REMOTE_WRITE_URL`
- [x] Alloy prometheus.scrape + remote_write blocks configured
  - `alloy-config.metrics.alloy:91-109` — blocks active, not commented
- [x] Verify metrics flowing to Mimir
  - Confirmed via MCP query: `http_requests_total`, `ai_llm_tokens_total` present with app="cogni-template"

### Phase 2: Metric Label Audit — DONE

- [x] Audit `src/shared/observability/server/metrics.ts` — labels are low-cardinality only
  - `route`, `method`, `status`, `provider`, `model_class`, `code`
- [x] Confirm no user/wallet/key/reqId labels — none present
- [x] Confirm route labels use templates — `wrapRouteHandlerWithLogging.ts:165-166` uses `routeId`

### Phase 2.5: Metrics Infrastructure Fixes — DONE

> These fixes ensure metrics are correctly labeled and don't conflate scraper traffic with user traffic.

- [x] **Add `env` to default labels** — `metrics.ts:31-36`

  ```typescript
  metricsRegistry.setDefaultLabels({
    app: "cogni-template",
    env: process.env.DEPLOY_ENVIRONMENT ?? "local",
  });
  ```

  - Preview and production metrics now distinguishable via `env` label

- [x] **Exclude `/api/metrics` from `http_requests_total`** — scraper traffic excluded
  - Implemented in `wrapRouteHandlerWithLogging.ts:166`
  - Skip metrics recording when `routeId === "meta.metrics"`
  - Scraper traffic no longer pollutes user traffic analytics

- [x] **Verify scrape timeout is set** — Alloy config has explicit timeout
  - `alloy-config.metrics.alloy:96` — `scrape_timeout = "10s"`

### Phase 3: Backend Implementation — DONE

Hexagonal architecture implementation:

- [x] Port — `src/ports/metrics-query.port.ts` (MetricsQueryPort interface)
- [x] Adapter — `src/adapters/server/metrics/mimir.adapter.ts` (Mimir implementation)
- [x] Test double — `src/adapters/test/metrics/fake-metrics.adapter.ts`
- [x] Container wiring — `src/bootstrap/container.ts` (environment-based adapter selection)
- [x] Contract — `src/contracts/analytics.summary.v1.contract.ts` (Zod schemas)
- [x] Service — `src/features/analytics/services/analytics.ts` (k-anonymity logic)
- [x] Facade — `src/app/_facades/analytics/summary.server.ts` (type mapping)
- [x] Route — `src/app/api/v1/analytics/summary/route.ts` (HTTP endpoint with caching)
- [x] Environment — `src/shared/env/server.ts` (PROMETHEUS*REMOTE_WRITE_URL, PROMETHEUS_QUERY_URL, PROMETHEUS_USERNAME, PROMETHEUS_PASSWORD, ANALYTICS*\*)
- [x] Tests — Unit, adapter, and contract tests (k-anonymity, timeout, PII denylist)

Endpoint: `GET /api/v1/analytics/summary?window={7d|30d|90d}`

### Phase 4: Frontend Implementation

> **Invariant:** Reuse `ActivityChart` from `/activity` for time series; reuse shadcn primitives (Card, Select, Chart); recharts already installed.

- [ ] Create `WindowSelector` component — adapts `TimeRangeSelector` pattern for 7d/30d/90d enum
- [ ] Create `AnalyticsSummaryCards` component — 4 stat cards using shadcn/card
- [ ] Create `ModelDistributionChart` component — recharts BarChart wrapper (parallel to ActivityChart)
- [ ] Create `PrivacyFooter` component — simple disclaimer text
- [ ] Create client view `src/app/(public)/analytics/view.tsx` — composes all charts
- [ ] Create server page `src/app/(public)/analytics/page.tsx` — RSC fetches from facade
- [ ] Implement null-handling for k-anonymity suppression (display "—" or filter nulls)
- [ ] Add to navigation (optional)

### Phase 5: Security Hardening

- [ ] Add Caddy rate limit rule for `/api/v1/analytics/*`
- [ ] Verify k-anonymity suppression in unit tests
- [ ] Integration test: confirm no PII in responses

### Phase 6: Deployment

- [ ] Add env vars to preview/prod configs
- [ ] Deploy and verify metrics display correctly

---

## Public Analytics Page — System Design

### Overview

Public transparency page at `/analytics` displaying aggregated platform metrics with **enforceable privacy guarantees**:

1. **Fixed query windows** — 7d/30d/90d only, no arbitrary time ranges
2. **Server-side allowlist** — No client-controlled PromQL
3. **K-anonymity suppression** — Buckets with <50 requests return `null`
4. **Low-cardinality labels only** — No user/wallet/key identifiers

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

---

## Security Model

### Fixed Windows — Query Range with Bucketed Steps

| Window | Bucket | Step | Max Datapoints |
| ------ | ------ | ---- | -------------- |
| 7d     | 1h     | 1h   | 168            |
| 30d    | 6h     | 6h   | 120            |
| 90d    | 1d     | 1d   | 90             |

**Invariants:**

- Use `/api/v1/query_range` with `step` = bucket size
- Use `increase(counter[bucket])` for timeseries — **never** `rate(counter[7d])`
- For `histogram_quantile()`: use `rate(...[5m])` (short range), chart granularity controlled by `step`

### Server-Side Query Allowlist

**Invariants:**

- No client-controlled PromQL, label filters, or time ranges
- `env` hardcoded server-side from `DEPLOY_ENVIRONMENT` — preview/prod never mixed
- All queries include `route!="meta.metrics"` to exclude scraper traffic
- All queries include `env="${ENV}"` for environment isolation

**Query patterns:**

| Metric             | Pattern                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| Requests           | `sum(increase(http_requests_total{app,env,route!="meta.metrics"}[bucket]))`                             |
| Tokens             | `sum(increase(ai_llm_tokens_total{app,env}[bucket]))`                                                   |
| Error rate         | `sum(increase(...status="5xx"...)) / sum(increase(...))`                                                |
| Latency p95        | `histogram_quantile(0.95, sum(rate(..._bucket{app,env}[5m])) by (le))` via query_range with step=bucket |
| Model distribution | `sum by (model_class) (increase(ai_llm_tokens_total{app,env}[bucket]))`                                 |

### K-Anonymity Suppression

**Invariants:**

- K = 50 (configurable via `ANALYTICS_K_THRESHOLD`)
- Query `requestCountDenominator` series with **same filters, bucket, and step** as displayed series
- Suppress each bucket pointwise where `requestCount < K` → return `null`
- Denominator = `sum(increase(http_requests_total{app,env,route!="meta.metrics"}[bucket]))`

### Label Hygiene

**ALLOWED labels (low-cardinality):**

- `app`, `env`, `route` (template), `method`, `status` (bucket), `provider`, `model_class`, `code`

**FORBIDDEN (never emit or query):**

- `user_id`, `wallet`, `api_key`, `virtual_key`, `reqId`, `ip`, `user_agent`
- Raw paths with IDs or query params

---

## API Contract

**File:** `src/contracts/analytics.summary.v1.contract.ts`

**Input:** `{ window: "7d" | "30d" | "90d" }` — enum only, default "7d"

**Output shape:**

- `window`, `generatedAt`, `cacheTtlSeconds`
- `summary`: `totalRequests`, `totalTokens`, `errorRatePercent`, `latencyP50Ms`, `latencyP95Ms` — all `number | null`
- `timeseries`: `requestRate`, `tokenRate`, `errorRate` — arrays of `{ timestamp, value: number | null }`
- `distribution.modelClass`: `{ free, standard, premium }` — all `number | null`

**Invariant:** All numeric values nullable — `null` indicates k-anonymity suppression.

---

## UI Layout — MVP

```
┌─────────────────────────────────────────────────────────────────┐
│  Platform Analytics                        [7d] [30d] [90d]     │
│  Public metrics • Updated every 60s                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │
│  │ Requests  │ │  Tokens   │ │Error Rate │ │ Latency   │       │
│  │   1.2M    │ │   25.4B   │ │   0.03%   │ │ p95: 1.2s │       │
│  │    (—)    │ │    (—)    │ │    (—)    │ │    (—)    │       │ ← null displays as "—"
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘       │
├─────────────────────────────────────────────────────────────────┤
│  Requests Over Time (per {bucket})                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Tokens Over Time (per {bucket})                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Error Rate Over Time (per {bucket})                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ▂▃▂▃▂▃▂▃▂▃▂▃                                             │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Model Usage Distribution (by tokens)                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Free       █████████████                                │   │
│  │  Standard   ████████████████████                         │   │
│  │  Premium    ██████                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Data is aggregated and anonymized. Individual user data is     │
│  never exposed. Low-activity periods are suppressed.            │
└─────────────────────────────────────────────────────────────────┘
```

**MVP Metrics:**

- **Summary Cards:** Total Requests, Total Tokens, Error Rate %, Latency p95
- **Time Series:** Request Rate, Token Rate, Error Rate (3 separate AreaCharts)
- **Distribution:** Model Class by tokens (horizontal BarChart)

**Excluded from MVP:** Latency p50 (only p95 in summary card), model distribution side-by-side with error rate (stacked layout instead)

**UI labels are dynamic based on window:**

- 7d → "per hour"
- 30d → "per 6 hours"
- 90d → "per day"

**Null-handling invariant:** All numeric values nullable (k-anonymity). Display "—" for null stats; filter or show gaps for null timeseries points.

### Component Structure

```
src/app/(public)/analytics/
├── page.tsx                       # Server component (RSC, fetches facade)
└── view.tsx                       # Client component (composes all charts)

src/features/analytics/components/
├── WindowSelector.tsx             # 7d/30d/90d selector (adapts TimeRangeSelector)
├── AnalyticsSummaryCards.tsx      # 4 stat cards grid (shadcn/card)
├── ModelDistributionChart.tsx     # recharts BarChart wrapper
└── PrivacyFooter.tsx              # Disclaimer text

Reused:
- src/components/kit/data-display/ActivityChart.tsx (time series)
- src/components/vendor/shadcn/* (Card, Select, Chart primitives)
```

---

## Caching & Rate Limiting

| Layer            | Setting                                                         |
| ---------------- | --------------------------------------------------------------- |
| Server headers   | `Cache-Control: public, max-age=60, stale-while-revalidate=300` |
| React Query      | `staleTime: 60s`, `gcTime: 5min`, `refetchInterval: 60s`        |
| Caddy rate limit | 10 req/min per IP on `/api/v1/analytics/*`                      |

---

## Environment Variables

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

**Security**: Use separate tokens for write (Alloy) and read (app) paths to enforce least privilege.

---

## Acceptance Criteria

| Requirement                                               | Verification                          |
| --------------------------------------------------------- | ------------------------------------- |
| Timeseries changes when real traffic changes, not scraper | Query excludes `route="meta.metrics"` |
| Preview and production charts are disjoint                | `env` filter hardcoded server-side    |
| Low-activity buckets (<50 requests) are null-suppressed   | Unit test k-anonymity pointwise       |
| No client-controlled PromQL, labels, or time ranges       | Only `window` enum accepted           |
| No user identifiers in responses                          | Query allowlist excludes user labels  |
| Cache 60s+, rate limit 10/min                             | Response headers + Caddy config       |

---

## Non-Goals (Explicit Exclusions)

- **Per-user analytics** — Never
- **Cost/billing data** — Never expose `ai_llm_cost_usd_total` publicly
- **Real-time streaming** — 60s cache is sufficient
- **Arbitrary date ranges** — Fixed windows prevent correlation attacks
- **Export/download** — Display-only, no CSV/JSON export

---

## Standards

- `/api/metrics` is server-to-server only (Alloy scraping)—never expose to browser
- Use Grafana Cloud Metrics (Mimir) as time-series DB via Alloy `remote_write`
- Admin dashboard: Next.js page + server-only endpoints that query Mimir
- Public analytics: aggregated data only (counts, rates, distributions)
- Cache summaries (60s), rate-limit public endpoints (10 req/min/IP)

## Anti-patterns

- Do not parse Prometheus text format in browser
- Do not store historical metrics in app process memory
- Do not expose per-user, per-request, or billing data on public pages
- Do not expose user IDs, wallet addresses, API keys, or request content
- Do not accept arbitrary PromQL, time ranges, or label filters from clients
- Do not return data for buckets with <50 underlying events (k-anonymity)

---

## References

- [OBSERVABILITY.md](./OBSERVABILITY.md) — Metrics definitions
- [UI_IMPLEMENTATION_GUIDE.md](./UI_IMPLEMENTATION_GUIDE.md) — Component patterns
- [Prometheus HTTP API](https://prometheus.io/docs/prometheus/latest/querying/api/)
- [recharts](https://recharts.org/en-US/)
