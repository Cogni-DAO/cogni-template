---
work_item_id: ini.observability-hardening
work_item_type: initiative
title: Observability Hardening
state: Paused
priority: 2
estimate: 3
summary: Improve observability coverage — activity metrics granularity, test doubles for usage adapters, stack test coverage
outcome: Sub-day activity bucketing, FakeUsageAdapter for CI, and integration tests for the activity endpoint
assignees: derekg1729
created: 2026-02-06
updated: 2026-02-06
labels: [data, testing]
---

# Observability Hardening

## Goal

Improve observability infrastructure across three axes: (1) finer-grained activity metrics (sub-day bucketing), (2) test doubles that eliminate LiteLLM dependency in CI, and (3) integration test coverage for the activity endpoint.

## Roadmap

### Crawl (P0) — Current State

**Goal:** Activity dashboard with day-level aggregation and LiteLLM dependency.

| Deliverable                                                  | Status | Est | Work Item |
| ------------------------------------------------------------ | ------ | --- | --------- |
| Activity dashboard joins LiteLLM telemetry + charge_receipts | Done   | 1   | —         |
| `ActivityUsagePort` interface for LiteLLM `/spend/logs`      | Done   | 1   | —         |
| Zod schemas for LiteLLM response validation                  | Done   | 1   | —         |
| Activity service aggregation logic                           | Done   | 1   | —         |

### Walk (P1) — Test Infrastructure & Granularity

**Goal:** Remove LiteLLM CI dependency; add sub-day bucketing.

| Deliverable                                                                                               | Status      | Est | Work Item            |
| --------------------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Hourly bucketing: currently only day-level aggregation; need sub-day buckets for "Last Hour" view         | Not Started | 2   | (create at P1 start) |
| `FakeUsageAdapter` for stack tests: test double for `ActivityUsagePort` to avoid LiteLLM dependency in CI | Not Started | 2   | (create at P1 start) |
| Stack tests for Activity: integration tests for activity endpoint with real data flow                     | Not Started | 2   | (create at P1 start) |

### Run (P2+) — Advanced Observability

**Goal:** Full observability pipeline with alerting and dashboards.

| Deliverable                                                     | Status      | Est | Work Item            |
| --------------------------------------------------------------- | ----------- | --- | -------------------- |
| Reconciliation monitoring dashboards (from payments initiative) | Not Started | 2   | (create at P2 start) |
| Alert on LiteLLM `/spend/logs` degradation or unavailability    | Not Started | 1   | (create at P2 start) |

## Constraints

- LiteLLM is canonical for usage telemetry — no shadow metering, no local token storage
- If LiteLLM is down, fail loudly (503) — no fallback to partial data
- `FakeUsageAdapter` must implement `ActivityUsagePort` faithfully for test reliability

## Dependencies

- [ ] LiteLLM aggregation API for sub-day bucketing (verify `group_by=hour` works)
- [ ] Stack test infrastructure (docker-compose test mode)

## As-Built Specs

- [activity-metrics.md](../../docs/spec/activity-metrics.md) — activity dashboard design, LiteLLM dependency, gating model
- [observability.md](../../docs/spec/observability.md) — structured logging, tracing

## Design Notes

Content extracted from original `docs/ACTIVITY_METRICS.md` TODO section during docs migration. The `METRICS_OBSERVABILITY.md` and `OBSERVABILITY_REQUIRED_SPEC.md` docs will contribute additional content when migrated.
