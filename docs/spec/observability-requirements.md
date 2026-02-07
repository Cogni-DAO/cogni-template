---
id: spec.observability-requirements
type: spec
title: Required Observability Design
status: draft
spec_state: draft
trust: draft
summary: Infrastructure-layer observability invariants for silent death detection, pre-crash visibility, alert strategy, and health check layering
read_when: Implementing health probes, container metrics, alerting, or resource limits
implements: []
owner: cogni-dev
created: 2026-02-04
verified: null
tags:
  - observability
  - deployment
  - alerting
---

# Required Observability Design

## Context

Application logs cannot attribute SIGKILL/OOM — the kernel terminates the process instantly. Container-layer signals and process runtime metrics are required to detect and diagnose silent container death.

**Incident trigger (2026-02-04):** Preview app died silently at 09:28 UTC. Deploy started at 09:22:50, app booted at 09:23:23, served traffic 09:25–09:28, then zero logs. `deploy.sh` emits `deployment.complete` but only `deployment.started` was observed. scheduler-worker detected the outage 30 min later via `HeadersTimeoutError`. Caddy returned 502 to all users with no alert.

## Goal

Define the observability invariants that ensure silent container death, OOM, and deploy failures are detected and alerted within 90 seconds, not 30 minutes.

## Non-Goals

- Relying on app logs for SIGKILL detection (impossible by design)
- Implementation checklists (see [ini.observability-hardening](../../work/initiatives/ini.observability-hardening.md) Required Observability Track)

---

## Core Invariants

1. **BELOW_APP_ATTRIBUTION**: SIGKILL detection must come from infrastructure (cgroup metrics, container exit events), never from application logs.

2. **PRE_CRASH_CURVE**: Node.js heap/RSS/event-loop metrics must be continuously exported so memory pressure is visible before OOM.

3. **HEARTBEAT_LIVENESS**: Absence of heartbeat metric timestamp OR failing synthetic probe to `/readyz` for >90s in preview|production must trigger an alert. Log-silence is a separate, lower-severity signal for "logging pipeline degraded" — not app death.

4. **CONTAINER_RESTART_DETECTION**: Any app container restart or exit (including exit code 137/SIGKILL) in preview|production must alert and correlate to the current deploy SHA.

5. **DEPLOY_TO_HEALTHY_GATE**: Every deployment must have a verified `deployment.complete` OR `deployment.failed` event. A `deployment.started` without either within 5 minutes is an alert.

---

## Design

### Alert Strategy (Layered)

Each layer catches what the one above cannot. Heartbeat detects death but not cause. Container metrics attribute OOM but need a sidecar. Deploy canary catches post-deploy failures but not gradual leaks.

```
┌─────────────────────────────────────────────────────────────────────┐
│ HEARTBEAT ABSENT (Prometheus, P0)                                   │
│ ─────────────────────────────────                                   │
│ 1. Alert on: app_heartbeat_timestamp_seconds absent for >90s        │
│ 2. Fires for env=~"preview|production" only                         │
│ 3. Result: P1 critical (app is dead or metrics pipeline broken)     │
└─────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────┐
│ LOG SILENCE (Loki, P0 — separate concern)                           │
│ ────────────────────────────────────────                             │
│ 1. Alert on: count_over_time({service="app"}[5m]) == 0              │
│ 2. Result: P2 warning (logging pipeline degraded, NOT app death)    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (P1: container metrics available)
┌─────────────────────────────────────────────────────────────────────┐
│ MEMORY PRESSURE (Prometheus, P1)                                    │
│ ───────────────────────────                                         │
│ - cgroup_usage / cgroup_limit > 0.85 → warning                     │
│ - container_oom_kills_total increase → critical                     │
│ - Correlate with deploy SHA from deployment events                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DEPLOY CANARY (deploy.sh, P1, never blocking rollout)               │
│ ─────────────────────────                                           │
│ - Poll /readyz for 3 min post-deploy                                │
│ - Emit deployment.canary_passed or deployment.canary_failed         │
│ - Alert on canary_failed                                            │
│ - Canary failure does NOT auto-rollback (manual decision)           │
└─────────────────────────────────────────────────────────────────────┘
```

### Detection Option Comparison

| Option                                          | Detects OOM?           | Pre-crash curve?        | Detects app death?    | Effort                 |
| ----------------------------------------------- | ---------------------- | ----------------------- | --------------------- | ---------------------- |
| **`collectDefaultMetrics()` + heartbeat gauge** | No                     | Yes (heap/RSS/GC trend) | Yes (heartbeat stops) | ~10 lines              |
| **cAdvisor sidecar**                            | Yes (oom_kill counter) | Yes (cgroup memory)     | Yes (container gone)  | New container + config |
| **Platform-native (Akash/Spheron)**             | Yes (authoritative)    | Depends on API          | Yes                   | Unknown availability   |

**Decision:** P0 ships heartbeat + process metrics. P1 adds cAdvisor for OOM attribution. Platform-native is ideal but blocked on Spheron API investigation.

### Resource Limits

512Mi for app is based on: Next.js 16 base (~150MB) + OTel SDK (~30MB) + DI container + request overhead. The app died ~2min after boot — consistent with memory climbing past an implicit provider limit.

Compose `deploy.resources.limits` requires Swarm mode and is silently ignored by `docker compose up`. Use `mem_limit` and `cpus` (compose v2 syntax) for actual enforcement, or pass `--compatibility` flag in `deploy.sh`.

### Health Check Layering

| Endpoint  | Purpose                                 | Dependencies                        | Used by                                |
| --------- | --------------------------------------- | ----------------------------------- | -------------------------------------- |
| `/livez`  | Container liveness (process alive?)     | None                                | Docker HEALTHCHECK, K8s liveness probe |
| `/readyz` | Traffic readiness (can serve requests?) | Env, secrets, EVM RPC, Temporal, DB | K8s readiness probe, deploy canary     |

**Rule:** `/livez` must never import `serverEnv()` or check external services. `/readyz` validates the full dependency chain. DB check added to `/readyz` only.

### File Pointers

| File                                                     | Purpose                                               |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `src/shared/observability/server/metrics.ts`             | Prometheus registry, process metrics, heartbeat gauge |
| `platform/infra/services/runtime/docker-compose.yml`     | Production resource limits, Alloy health check        |
| `platform/infra/services/runtime/docker-compose.dev.yml` | Dev resource limits, Alloy health check               |
| `Dockerfile`                                             | HEALTHCHECK timeout configuration                     |
| `src/app/(infra)/readyz/route.ts`                        | Readiness probe with dependency checks                |
| `src/app/(infra)/livez/route.ts`                         | Liveness probe (dependency-free)                      |

## Acceptance Checks

**Automated:**

- `pnpm test -- readyz` — validates readiness probe with DB check
- `pnpm test -- livez` — validates liveness probe has no external dependencies

**Manual:**

1. Kill app container → verify heartbeat-absent alert fires within 90s
2. Verify `/livez` returns 200 without env vars loaded
3. Verify `/readyz` fails when DB is unavailable

## Open Questions

_(none)_

## Related

- [observability.md](./observability.md) — structured logging, tracing
- [health-probes.md](./health-probes.md) — liveness/readiness probe separation
- [Initiative: Observability Hardening](../../work/initiatives/ini.observability-hardening.md)
