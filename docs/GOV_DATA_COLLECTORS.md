# Governance Data Collectors

> SourceAdapters emitting CloudEvents SignalEvents into `signal_events`; scheduled via Temporal.

## Collectors

| Adapter                       | Event Types                                                                             | Incident Key                                   | Notes                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PrometheusAlertsAdapter`     | `prometheus.alert.firing`, `prometheus.alert.resolved`                                  | `{scope}:{alertname}:{fingerprint}`            | MVP detection source-of-truth                                                                           |
| `OpenRouterModelProbeAdapter` | `openrouter.model.probe.{ok\|degraded\|rate_limited}`, `openrouter.pool.health_changed` | `{scope}:model_health:{model_id}:{capability}` | Probe rpm/429_rate/p95; quarantine bad :free models; require probe-confirmed tool+stream before routing |

## Adding a Collector

1. Implement `SourceAdapter` interface (`packages/data-sources/types.ts`)
2. Define deterministic event ID scheme
3. Create Temporal Schedule (every 5m default)
4. Document incident_key pattern above

---

**Related:** [AI_GOVERNANCE_DATA.md](AI_GOVERNANCE_DATA.md)
