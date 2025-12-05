# Metrics Observability Roadmap

See [OBSERVABILITY.md](./OBSERVABILITY.md) for current metrics implementation.

## TODO

- [ ] Deploy Grafana Cloud Metrics (Mimir) credentials to prod
- [ ] Uncomment Alloy prometheus.scrape + remote_write blocks
- [ ] Build admin dashboard page (`/admin/metrics`) with server-only JSON endpoints
- [ ] Add Grafana dashboards for p95 latency, error rate, cost/tokens

---

## Standards

- `/api/metrics` is server-to-server only (Alloy scraping)—never expose to browser
- Use Grafana Cloud Metrics (Mimir) as time-series DB via Alloy `remote_write`
- Admin dashboard: Next.js page + server-only endpoints that query Mimir (Prometheus HTTP API)
- Cache admin summaries (30-60s), keep panel set minimal (p95 latency, error rate, cost/tokens)

## Anti-patterns

- Do not parse Prometheus text format in browser
- Do not store historical metrics in app process memory
