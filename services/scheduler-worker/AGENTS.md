# scheduler-worker-service · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-01-22
- **Status:** draft

## Purpose

**SCHEDULER_WORKER_SERVICE:** Temporal Worker for scheduled graph execution. Connects to Temporal, registers workflows and activities, executes scheduled graphs via internal API. Runs independently of the Next.js app, enabling horizontal scaling.

## Pointers

- [SCHEDULER_SPEC.md](../../docs/SCHEDULER_SPEC.md) - Full scheduler specification
- [TEMPORAL_PATTERNS.md](../../docs/TEMPORAL_PATTERNS.md) - Temporal patterns and anti-patterns
- [SERVICES_ARCHITECTURE.md](../../docs/SERVICES_ARCHITECTURE.md) - Service structure guidelines

## Boundaries

```json
{
  "layer": "services",
  "may_import": ["packages"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters",
    "shared",
    "bootstrap",
    "types"
  ]
}
```

**Critical:**

- Per WORKER_NEVER_CONTROLS_SCHEDULES: Does NOT depend on `ScheduleControlPort`
- Schema access is transitive through `@cogni/db-client`
- SCHEDULER_API_TOKEN is a secret - never log it

## Public Surface

- **Exports:** none (standalone service, not a library)
- **CLI:** `pnpm --filter @cogni/scheduler-worker-service dev|build|start`
- **Env/Config keys:**
  - `TEMPORAL_ADDRESS` (required) - Temporal server address
  - `TEMPORAL_NAMESPACE` (required) - Temporal namespace (cogni-{APP_ENV})
  - `TEMPORAL_TASK_QUEUE` (required) - Task queue name (scheduler-tasks)
  - `DATABASE_URL` (required) - PostgreSQL for DB activities
  - `SCHEDULER_API_TOKEN` (required, secret) - Bearer token for internal API
  - `APP_BASE_URL` (required) - Base URL for internal API calls
  - `LOG_LEVEL`, `SERVICE_NAME`, `HEALTH_PORT` - Optional config
- **Files considered API:** `src/main.ts` (entry point), `Dockerfile`

## Responsibilities

- This directory **does**: Connect to Temporal, register GovernanceScheduledRunWorkflow, execute activities (validateGrant, createRun, executeGraph, updateRun), handle SIGTERM/SIGINT
- This directory **does not**: Import from src/, create/modify/delete schedules (CRUD is authority), define port interfaces

## Usage

```bash
# Development (requires Temporal running + env vars)
pnpm --filter @cogni/scheduler-worker-service dev

# Build for production
pnpm --filter @cogni/scheduler-worker-service build

# Run tests
pnpm --filter @cogni/scheduler-worker-service test

# Docker
docker build -f services/scheduler-worker/Dockerfile -t scheduler-worker .
```

## Standards

- Workflows are deterministic (no I/O) - per TEMPORAL_DETERMINISM
- Activities are plain async functions - all I/O happens here
- Composition root owns logger creation via `pino`
- Config validated via Zod schema in `src/config.ts`
- Graceful shutdown on SIGTERM/SIGINT

## Dependencies

- **Internal:** `@cogni/scheduler-core`, `@cogni/db-client`
- **External:** `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`, `pino`, `zod`

## Change Protocol

- Update this file when env vars or activities change
- Coordinate with SCHEDULER_SPEC.md and TEMPORAL_PATTERNS.md invariants
- Changes require updating docker-compose.dev.yml

## Notes

- Per NO_WORKER_RECONCILIATION: Temporal handles scheduling natively
- Per SCHEDULED_TIMESTAMP_FROM_TEMPORAL: scheduledFor comes from Schedule action
- Per EXECUTION_VIA_SERVICE_API: executeGraphActivity calls internal API with Idempotency-Key
