# scheduler-worker-service · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2026-01-20
- **Status:** draft

## Purpose

**SCHEDULER_WORKER_SERVICE:** Standalone deployable service for scheduled graph execution via Graphile Worker. Composition root that wires `@cogni/db-client` adapters to worker tasks. Runs independently of the Next.js app, enabling horizontal scaling and independent deployment.

## Pointers

- [SCHEDULER_SPEC.md](../../docs/SCHEDULER_SPEC.md) - Full scheduler specification
- [SCHEDULER_SERVICE_REFACTOR.md](../../docs/SCHEDULER_SERVICE_REFACTOR.md) - Refactor plan

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

**Critical:** This service does NOT import `@cogni/db-schema` directly. Schema access is transitive through `@cogni/db-client`.

## Public Surface

- **Exports:** none (standalone service, not a library)
- **CLI:** `pnpm --filter @cogni/scheduler-worker-service dev|build|start`
- **Env/Config keys:** `DATABASE_URL` (required), `LOG_LEVEL`, `WORKER_CONCURRENCY`, `WORKER_POLL_INTERVAL`, `SERVICE_NAME`
- **Files considered API:** `src/main.ts` (entry point), `Dockerfile`

## Responsibilities

- This directory **does**: Load env config, create db-client, wire adapters to worker deps, start Graphile Worker, handle SIGTERM/SIGINT
- This directory **does not**: Import from src/, define port interfaces (those come from @cogni/scheduler-core), execute graphs (v0 stub)

## Usage

```bash
# Development (requires DATABASE_URL in .env.local)
pnpm scheduler:dev

# Build for production
pnpm --filter @cogni/scheduler-worker-service build

# Run tests
pnpm --filter @cogni/scheduler-worker-service test

# Docker
docker build -f services/scheduler-worker/Dockerfile -t scheduler-worker .
docker run -e DATABASE_URL=postgres://... scheduler-worker
```

## Standards

- Composition root owns logger creation via `pino`, injects via `.child()`
- Config validated via Zod schema in `src/config.ts`
- Graceful shutdown on SIGTERM/SIGINT
- v0: Marks runs as success without executing graphs (deferred to next PR)

## Dependencies

- **Internal:** `@cogni/scheduler-core`, `@cogni/db-client`
- **External:** `graphile-worker`, `pino`, `zod`, `cron-parser`, `postgres`

## Change Protocol

- Update this file when env vars or task handlers change
- Coordinate with SCHEDULER_SPEC.md invariants
- Changes require updating docker-compose.dev.yml

## Notes

- Per SCHEDULER_WORKER_NO_DIRECT_SCHEMA: Gets schema transitively via db-client
- Per SERVICES_STANDALONE: Cannot import from src/\*\*
- Per RECONCILER_GUARANTEES_CHAIN: Runs reconciliation on startup and self-reschedules every 5m
