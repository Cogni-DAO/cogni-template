---
id: gov-data-collectors-spec
type: spec
title: Governance Data Collectors
status: active
spec_state: draft
trust: draft
summary: SourceAdapters emitting CloudEvents SignalEvents into signal_events, scheduled via Temporal. Two collectors — PrometheusAlertsAdapter and OpenRouterModelProbeAdapter.
read_when: Adding a new data collector, debugging signal event ingestion, or working with the governance data pipeline.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [data, ai-graphs]
---

# Governance Data Collectors

## Context

The governance data pipeline ingests external signals (alerts, model health probes) into the `signal_events` table as CloudEvents. Each collector implements the `SourceAdapter` interface and runs on a Temporal schedule (default every 5 minutes). Events use deterministic IDs and incident keys for correlation and deduplication.

## Goal

Provide a pluggable collector framework where each `SourceAdapter` emits typed `SignalEvents` into a shared table, scheduled reliably via Temporal, with deterministic event IDs for idempotency.

## Non-Goals

- Real-time event streaming (collectors are poll-based on Temporal schedules)
- Event processing/reaction logic (that's the governance agent layer, not the collectors)

## Core Invariants

1. **SOURCE_ADAPTER_INTERFACE**: Every collector implements `SourceAdapter` from `packages/data-sources/types.ts`. No ad-hoc ingestion paths.

2. **DETERMINISTIC_EVENT_ID**: Each adapter defines a deterministic event ID scheme so replayed schedules are idempotent.

3. **INCIDENT_KEY_CORRELATION**: Each event carries an `incident_key` in a documented format for downstream correlation and deduplication.

4. **TEMPORAL_SCHEDULED**: Collectors run on Temporal Schedules (every 5m default). No cron jobs, no manual triggers in production.

## Design

### Collectors

| Adapter                       | Event Types                                                                             | Incident Key                                   | Notes                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PrometheusAlertsAdapter`     | `prometheus.alert.firing`, `prometheus.alert.resolved`                                  | `{scope}:{alertname}:{fingerprint}`            | MVP detection source-of-truth                                                                           |
| `OpenRouterModelProbeAdapter` | `openrouter.model.probe.{ok\|degraded\|rate_limited}`, `openrouter.pool.health_changed` | `{scope}:model_health:{model_id}:{capability}` | Probe rpm/429_rate/p95; quarantine bad :free models; require probe-confirmed tool+stream before routing |

### Adding a Collector

1. Implement `SourceAdapter` interface (`packages/data-sources/types.ts`)
2. Define deterministic event ID scheme
3. Create Temporal Schedule (every 5m default)
4. Document incident_key pattern in the table above

### File Pointers

| File                             | Role                                 |
| -------------------------------- | ------------------------------------ |
| `packages/data-sources/types.ts` | `SourceAdapter` interface definition |

## Acceptance Checks

**Manual:**

1. Verify each adapter emits events with correct CloudEvents envelope
2. Verify deterministic event IDs — replayed schedule produces no duplicate `signal_events` rows
3. Verify Temporal Schedule runs at configured interval

## Open Questions

_(none)_

## Related

- [AI Governance Data](../../docs/AI_GOVERNANCE_DATA.md) — governance agent layer consuming these signals
- [Observability](./observability.md) — structured logging for collector runs
