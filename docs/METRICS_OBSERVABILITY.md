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
- [x] Environment — `src/shared/env/server.ts` (MIMIR*URL, MIMIR_USER, MIMIR_TOKEN, ANALYTICS*\*)
- [x] Tests — Unit, adapter, and contract tests (k-anonymity, timeout, PII denylist)

Endpoint: `GET /api/v1/analytics/summary?window={7d|30d|90d}`

### Phase 4: Frontend Implementation

- [ ] Add recharts dependency — `pnpm add recharts`
- [ ] Create feature components — `src/features/analytics/components/`
- [ ] Create hooks — `src/features/analytics/hooks/useAnalyticsSummary.ts`
- [ ] Create page — `src/app/(public)/analytics/page.tsx`
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

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Platform Analytics                        [7d] [30d] [90d]     │
│  Aggregated metrics • Updated every 60s                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │
│  │ Requests  │ │  Tokens   │ │Error Rate │ │ Latency   │       │
│  │   1.2M    │ │   25.4B   │ │   0.03%   │ │ p95: 1.2s │       │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘       │
├─────────────────────────────────────────────────────────────────┤
│  Requests (per {bucket})                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Tokens (per {bucket})                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅▄▃▂▃▄▅▆▇█▇▆▅                     │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Model Distribution         Error Rate Over Time                │
│  ┌────────────────┐        ┌────────────────┐                  │
│  │ █ free         │        │ ▂▃▂▃▂▃▂▃▂▃▂▃  │                  │
│  │ ██ standard    │        └────────────────┘                  │
│  │ ███ premium    │                                             │
│  └────────────────┘                                             │
├─────────────────────────────────────────────────────────────────┤
│  Data is aggregated and anonymized. Individual user data is     │
│  never exposed. Low-activity periods are suppressed.            │
└─────────────────────────────────────────────────────────────────┘
```

**UI labels are dynamic based on window:**

- 7d → "per hour"
- 30d → "per 6 hours"
- 90d → "per day"

### Component Structure

```
src/features/analytics/
├── components/
│   ├── AnalyticsDashboard.tsx     # Main container
│   ├── MetricCard.tsx             # Summary stat card
│   ├── TimeseriesChart.tsx        # recharts line chart
│   ├── DistributionChart.tsx      # recharts bar chart
│   ├── WindowSelector.tsx         # 7d/30d/90d toggle
│   └── PrivacyFooter.tsx          # Transparency disclaimer
├── hooks/
│   └── useAnalyticsSummary.ts     # React Query hook
└── services/
    └── analytics.ts               # Mimir query service
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

| Variable                     | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `MIMIR_URL`                  | Grafana Cloud Mimir endpoint        |
| `MIMIR_USER`                 | Mimir basic auth username           |
| `MIMIR_TOKEN`                | Mimir basic auth token              |
| `ANALYTICS_K_THRESHOLD`      | K-anonymity threshold (default: 50) |
| `ANALYTICS_QUERY_TIMEOUT_MS` | Query timeout (default: 5000)       |

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
