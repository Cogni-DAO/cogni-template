# Scheduler Worker Service Refactor

> Transform scheduler-worker from workaround architecture into standalone service with proper package boundaries.

## End State

```
packages/scheduler-core/     # Types + port interfaces (pure contracts)
packages/db-schema/          # Canonical schema with subpath exports
packages/db-client/          # Drizzle client factory + adapters
services/scheduler-worker/   # Deployable service (task logic + Dockerfile)
```

**Delete entirely (no shims):**

- `packages/scheduler-worker/` → contents move to `services/scheduler-worker/`
- `src/scripts/run-scheduler-worker.ts` → replaced by service entry point
- `src/scripts/` directory → remove layer from dependency-cruiser
- `src/types/scheduling.ts` → moved to `@cogni/scheduler-core`
- `src/ports/scheduling/` → moved to `@cogni/scheduler-core`
- `src/adapters/server/scheduling/` → moved to `@cogni/db-client`
- `src/shared/db/schema.scheduling.ts` → moved to `@cogni/db-schema`

---

## Approval Gates

| Gate                   | Requirement                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **1. Workspace**       | `pnpm-workspace.yaml` includes `services/*`; CI builds via `pnpm -r --filter`                            |
| **2. Schema Slices**   | `db-schema` subpath exports are real slices; refs owns FK targets; depcruise forbids cross-slice imports |
| **3. Worker Deps**     | Worker imports schema ONLY through `@cogni/db-client`, never `@cogni/db-schema` directly                 |
| **4. No Shims**        | Clean migration — update all imports in `src/` directly, no re-export shims                              |
| **5. Server Boundary** | `db-client` only importable from server layers; depcruise prevents client bundle pollution               |

---

## Dependency Graph

```
services/scheduler-worker/
    ├── @cogni/scheduler-core (types + ports)
    └── @cogni/db-client (client + adapters)
            └── @cogni/db-schema/scheduling (transitive only)

src/ (Next.js app)
    ├── @cogni/scheduler-core
    ├── @cogni/db-client
    └── @cogni/db-schema/* (all slices - direct dep)
```

**Key constraints:**

- Worker does NOT list `@cogni/db-schema` in package.json — transitive through db-client only
- db-client re-exports ONLY scheduling slice, not auth/billing

---

## Package Specifications

### `packages/scheduler-core/`

**Purpose:** Types + port interfaces only (no implementations)

**Exports:** `ExecutionGrant`, `ScheduleSpec`, `ScheduleRun`, port interfaces, error classes

**Invariants:**

- FORBIDDEN: `@/`, `src/`, drizzle-orm, any I/O
- ALLOWED: Pure TypeScript types/interfaces only

### `packages/db-schema/`

**Purpose:** Canonical schema source of truth with domain subpath exports

**Subpath exports (separate entrypoints, not barrel re-exports):**

- `@cogni/db-schema/refs` → **FK target tables**: users, billing_accounts (canonical home)
- `@cogni/db-schema/scheduling` → execution_grants, schedules, schedule_runs (imports refs for FKs)
- `@cogni/db-schema/auth` → auth-specific tables (imports refs for users)
- `@cogni/db-schema/billing` → billing-specific tables (imports refs for billing_accounts)

**FK Reference Pattern:** `refs.ts` owns the actual table objects that are FK targets across slices. Domain slices import table objects from `/refs` for their FK constraints. This inverts ownership — shared tables live in refs, domain slices extend them.

```
refs.ts        → exports: users, billingAccounts (table objects)
scheduling.ts  → imports from refs, defines: executionGrants, schedules, scheduleRuns
auth.ts        → imports from refs, extends with auth-specific tables
billing.ts     → imports from refs, extends with billing-specific tables
```

**Invariants:**

- FORBIDDEN: `@/`, `src/`, business logic, adapters
- FORBIDDEN: Circular imports (refs imports nothing from other slices)
- FORBIDDEN: scheduling/auth/billing importing each other directly
- ALLOWED: All slices import from `/refs` for FK table objects

### `packages/db-client/`

**Purpose:** Drizzle client factory + scheduling adapters

**Exports:**

- `createDbClient(connectionString: string)` — connection string injected, never from env
- Scheduling adapters implementing `@cogni/scheduler-core` ports
- Re-exports ONLY `@cogni/db-schema/scheduling` (not all slices)

**Invariants:**

- FORBIDDEN: `@/shared/env`, `process.env`, Next.js imports
- FORBIDDEN: Re-exporting auth/billing schema slices (prevents "everything reachable" smell)
- ALLOWED: `@cogni/scheduler-core`, `@cogni/db-schema/*`, drizzle-orm

### `services/scheduler-worker/`

**Purpose:** Standalone deployable worker service

**Contains:** Entry point, task logic, cron utils, Zod schemas, Dockerfile, tests

**Dependencies:** `@cogni/scheduler-core`, `@cogni/db-client`, graphile-worker, pino, zod

**NOT a dependency:** `@cogni/db-schema` — schema is transitive through db-client only

**Invariants:**

- FORBIDDEN: Any `src/` imports, `@/` aliases
- FORBIDDEN: `@cogni/db-schema` in package.json (prevents accidental direct imports)
- ALLOWED: `@cogni/scheduler-core`, `@cogni/db-client`, graphile-worker

---

## Implementation Checklist

### Phase 1: Create Packages

#### `packages/scheduler-core/`

- [x] Create `package.json` with name `@cogni/scheduler-core`
- [x] Create `tsconfig.json` with composite mode
- [x] Create `tsup.config.ts`
- [ ] Create `vitest.config.ts`
- [x] Create `src/index.ts` (barrel export)
- [x] Create `src/types.ts` (from `src/types/scheduling.ts`)
- [x] Create `src/ports/*.ts` (from `src/ports/scheduling/*.ts`)
- [x] Create `src/ports/index.ts` (ports barrel - errors consolidated in port files)
- [x] Add to root `tsconfig.json` references
- [x] Add to root `package.json` dependencies
- [x] Add to `biome/base.json` noDefaultExport override (tsup config)
- [ ] Add dependency-cruiser rule: `no-scheduler-core-to-src`

#### `packages/db-schema/`

- [x] Create `package.json` with subpath exports (separate entrypoints per slice)
- [x] Create `tsconfig.json` with composite mode
- [x] Create `tsup.config.ts` with multiple entry points
- [x] Create `src/refs.ts` (FK target table objects: users, billingAccounts — canonical home)
- [x] Create `src/scheduling.ts` (from `src/shared/db/schema.scheduling.ts`, imports table objects from refs)
- [x] Create `src/auth.ts` (re-exports users from refs)
- [x] Create `src/billing.ts` (billing-specific tables, imports refs)
- [x] Create `src/ai.ts` (ai telemetry tables)
- [x] NO barrel index.ts — slices are separate entrypoints
- [x] Add to root `tsconfig.json` references
- [x] Add to root `package.json` dependencies
- [x] Add to `biome/base.json` noDefaultExport override
- [ ] Add dependency-cruiser rule: `no-db-schema-to-src`
- [ ] Add dependency-cruiser rule: `no-cross-slice-schema-imports`
- [ ] Add dependency-cruiser rule: `no-refs-to-slices` (refs imports nothing)

#### `packages/db-client/`

- [x] Create `package.json` depending on `@cogni/scheduler-core`, `@cogni/db-schema`
- [x] Create `tsconfig.json` with composite mode
- [x] Create `tsup.config.ts`
- [ ] Create `vitest.config.ts`
- [x] Create `src/client.ts` with `createDbClient(connectionString)` and `LoggerLike` interface
- [x] Create `src/adapters/*.ts` (from `src/adapters/server/scheduling/*.ts`)
- [x] Create `src/index.ts` — exports client, adapters, and re-exports scheduling schema
- [x] Add to root `tsconfig.json` references
- [x] Add to root `package.json` dependencies
- [x] Add to `biome/base.json` noDefaultExport override
- [ ] Add dependency-cruiser rule: `no-db-client-to-src`

### Phase 2: Create Service

#### `services/scheduler-worker/`

- [x] Verify `pnpm-workspace.yaml` includes `services/*`
- [x] Create `package.json` as workspace package (`@cogni/scheduler-worker-service`)
- [x] Create `tsconfig.json`
- [x] Create `Dockerfile` (multi-stage build)
- [x] Create `AGENTS.md`
- [x] Move `packages/scheduler-worker/src/worker.ts` → `src/worker.ts`
- [x] Move `packages/scheduler-worker/src/tasks/*` → `src/tasks/*`
- [x] Move `packages/scheduler-worker/src/schemas/*` → `src/schemas/*` (now in `scheduler-core`)
- [x] Move `packages/scheduler-worker/src/utils/*` → `src/utils/*`
- [x] Create `src/main.ts` (entry point with signal handling)
- [x] Create `src/config.ts` (Zod env schema)
- [x] Move `packages/scheduler-worker/tests/*` → `tests/*`
- [x] Update all imports to use `@cogni/scheduler-core`, `@cogni/db-client`
- [x] Verify NO direct `@cogni/db-schema` imports

### Phase 3: Update src/ Imports (No Shims)

Update all existing imports in `src/` to use new packages directly:

- [x] Find all `@/types/scheduling` imports → change to `@cogni/scheduler-core`
- [x] Find all `@/ports/scheduling` imports → change to `@cogni/scheduler-core`
- [x] Find all `@/adapters/server/scheduling` imports → change to `@cogni/db-client`
- [x] Find all `@/shared/db/schema.scheduling` imports → change to `@cogni/db-schema/scheduling`
- [x] Update `src/bootstrap/container.ts` to use new packages
- [x] Update `src/ports/index.ts` to re-export from `@cogni/scheduler-core`
- [x] Update `src/shared/db/schema.ts` barrel to import from `@cogni/db-schema`

### Phase 4: Configuration Updates

- [ ] Update root `tsconfig.json` — remove `packages/scheduler-worker` reference
- [ ] Update root `package.json` — remove `@cogni/scheduler-worker` dependency
- [ ] Update `biome/base.json` — remove `packages/scheduler-worker` entries
- [ ] Update `.dependency-cruiser.cjs`:
  - [ ] Remove `scripts` layer from srcLayers
  - [ ] Remove scripts allowed rule
  - [ ] Add rule: `no-scheduler-core-to-src`
  - [ ] Add rule: `no-db-schema-to-src`
  - [ ] Add rule: `no-refs-to-slices`
  - [ ] Add rule: `no-cross-slice-schema-imports`
  - [ ] Add rule: `no-db-client-to-src`
  - [ ] Add rule: `db-client-server-only` (prevent client bundle pollution)
  - [ ] Add rule: `scheduler-worker-no-direct-schema`
- [ ] Update `docker-compose.dev.yml` — add scheduler-worker service
- [ ] Update `vitest.workspace.ts` — remove scheduler-worker package
- [ ] Update root `package.json` scripts — `scheduler:dev` points to service

### Phase 5: Deletions

> **Gate:** Run `pnpm arch:check && pnpm typecheck` BEFORE deletions to verify import rewrites are complete.

- [x] Delete `packages/scheduler-worker/` (entire directory)
- [x] Delete `src/scripts/run-scheduler-worker.ts`
- [x] Delete `src/scripts/` directory (if empty)
- [x] Delete `src/types/scheduling.ts`
- [x] Delete `src/ports/scheduling/` directory
- [x] Delete `src/adapters/server/scheduling/` directory
- [x] Delete `src/shared/db/schema.scheduling.ts`

### Phase 6: CI/CD Integration

> First `services/` entry. Future dev identifies all integration points.

- [ ] Verify `pnpm -r --filter "@cogni/scheduler-worker-service" build` works in CI
- [ ] Add service to Docker build matrix (if applicable)
- [ ] Document service deployment in `platform/runbooks/`
- [ ] Update `docs/ENVIRONMENTS.md` with scheduler-worker env vars
- [ ] Update `docs/ARCHITECTURE.md` services section
- [ ] Consider: separate CI workflow for services vs packages?

### Phase 7: Validation

- [ ] `pnpm install` — workspace resolves correctly
- [ ] `pnpm packages:build` — all packages build
- [ ] `pnpm arch:check` — no boundary violations
- [ ] `pnpm typecheck` — no type errors
- [ ] `pnpm test` — all tests pass
- [ ] Service starts locally and connects to DB
- [ ] Verify depcruise catches violations (test with intentional bad import)

---

## Dependency-Cruiser Rules

```javascript
// scheduler-core cannot import from src/
{
  name: "no-scheduler-core-to-src",
  severity: "error",
  from: { path: "^packages/scheduler-core/" },
  to: { path: "^src/" }
},

// db-schema cannot import from src/
{
  name: "no-db-schema-to-src",
  severity: "error",
  from: { path: "^packages/db-schema/" },
  to: { path: "^src/" }
},

// db-schema: refs is the root — imports nothing from other slices
{
  name: "no-refs-to-slices",
  severity: "error",
  from: { path: "^packages/db-schema/src/refs" },
  to: { path: "^packages/db-schema/src/(scheduling|auth|billing)" },
  comment: "refs.ts is the FK root; must not import from domain slices"
},

// db-schema: slices cannot import each other (only refs allowed)
{
  name: "no-cross-slice-schema-imports",
  severity: "error",
  from: { path: "^packages/db-schema/src/(scheduling|auth|billing)" },
  to: { path: "^packages/db-schema/src/(scheduling|auth|billing)" },
  comment: "Domain slices import from /refs only, never from each other"
},

// db-client cannot import from src/
{
  name: "no-db-client-to-src",
  severity: "error",
  from: { path: "^packages/db-client/" },
  to: { path: "^src/" }
},

// db-client must only be imported in server layers (prevent client bundle pollution)
{
  name: "db-client-server-only",
  severity: "error",
  from: { path: "^src/(?!bootstrap|adapters|app/api|app/_facades|app/_lib)" },
  to: { path: "^packages/db-client/" },
  comment: "db-client contains postgres/drizzle; only server layers may import"
},

// scheduler-worker cannot import db-schema (transitive through db-client only)
{
  name: "scheduler-worker-no-direct-schema",
  severity: "error",
  from: { path: "^services/scheduler-worker/" },
  to: { path: "^packages/db-schema/" },
  comment: "Worker has no db-schema dep; gets schema transitively through db-client"
}
```

---

## Related Docs

- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — Scheduler invariants and schema
- [PACKAGES_ARCHITECTURE.md](PACKAGES_ARCHITECTURE.md) — Package rules and CI/CD checklist
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal pattern

---

**Status:** Approved for implementation
**Last Updated:** 2025-01-20
