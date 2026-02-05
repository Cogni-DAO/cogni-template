# Database Row-Level Security Design

> [!CRITICAL]
> Every user-scoped table enforces tenant isolation via PostgreSQL RLS keyed on `current_setting('app.current_user_id')`. The application sets this per-transaction with `SET LOCAL`. Missing setting = deny all.

## Core Invariants

1. **RLS_ON_USER_TABLES**: The `users` table and all tables with a direct or transitive FK to `users.id` MUST have RLS enabled and forced (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY`). Standalone telemetry/idempotency tables are exempt.

2. **SET_LOCAL_PER_TRANSACTION**: Every application database call runs inside an explicit `BEGIN`/`COMMIT` transaction. The first statement is `SET LOCAL app.current_user_id = $1` where `$1` is the authenticated user ID from the session JWT. Without an explicit transaction, PostgreSQL autocommit wraps each statement in its own implicit transaction — so `SET LOCAL` would apply only to itself and be lost before the next query. This is the safety net: forgetting the wrapper means queries run with no `app.current_user_id` set, and RLS returns zero rows.

3. **SERVICE_BYPASS_CONTAINED**: A dedicated `app_service` PostgreSQL role (used by scheduler workers and internal services) has `BYPASSRLS`. The standard `app_user` role does not. Two roles, same database, different RLS enforcement. The service role **must** use a separate password (`APP_DB_SERVICE_PASSWORD`) that is never present in the web runtime environment — if `app_user` credentials leak, the attacker cannot escalate to the BYPASSRLS role.

4. **LEAST_PRIVILEGE_APP_ROLE**: The `app_user` role has `SELECT, INSERT, UPDATE, DELETE` on application tables only. No `DROP`, `TRUNCATE`, `CREATE`, `ALTER`. Migrations currently run as `app_user` (DB owner, via drizzle-kit + `DATABASE_URL`). Separating the migrator role from the runtime role is a P1 hardening item. On PG 15+, `REVOKE CREATE ON SCHEMA public` is best-practice signaling only — `app_user` inherits `CREATE` via `pg_database_owner` as DB owner.

5. **SSL_REQUIRED_NON_LOCAL**: Any `DATABASE_URL` not pointing to `localhost` or `127.0.0.1` must include `sslmode=require` (or stricter). Enforced by Zod refine at boot.

---

## Implementation Checklist

### P0: RLS + Least-Privilege Roles

#### Database Roles (provision.sh)

- [x] Extend `provision.sh` to `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` to `app_user` (revoke DDL)
- [x] Create `app_service` role with `BYPASSRLS` + same DML grants (for scheduler/worker)
- [x] `ALTER DEFAULT PRIVILEGES` so future tables get the same grants automatically

#### RLS Policies (Drizzle SQL migration)

- [x] `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on `users` + all 9 user-scoped tables (10 total)
- [x] Create `tenant_isolation` policy on each table (see Policy Design below)
- [x] Exempt `app_service` role via `BYPASSRLS` (no policy exclusion needed)

#### Application Plumbing (SET LOCAL)

- [x] Create `withTenantScope(userId, fn)` helper wrapping Drizzle transaction + `SET LOCAL`
- [x] Dual DB client in `packages/db-client`: `createAppDbClient(url)` (app_user, RLS enforced) and `createServiceDbClient(url)` (app_user_service, BYPASSRLS)
- [x] Move `withTenantScope` / `setTenantContext` to `packages/db-client` (generic over `Database` type so both Next.js and worker services share scoping semantics)
- [x] Import boundary: `createServiceDbClient` isolated in `@cogni/db-client/service` sub-path export. Adapter singleton `getServiceDb` isolated in `drizzle.service-client.ts` (outside barrel). Depcruiser `no-service-db-adapter-import` rule enforces only `auth.ts` may import it. Environmental enforcement (`APP_DB_SERVICE_PASSWORD` absent from web runtime) remains as defense-in-depth.
- [x] Wire `withTenantScope`/`setTenantContext` into all DB adapter methods that touch user-scoped tables (see Adapter Wiring Tracker below). Accounts: done (Commit 3). Payment attempts: done (Commit 4).
- [x] Ensure `userId` originates from session JWT (server-side), never from request body. Accounts: done (facades use `toUserId(sessionUser.id)` at edge). Payment attempts: done (Commit 4).
- [x] SIWE auth callback (`src/auth.ts`) uses `serviceDb` for pre-auth wallet lookup

#### SSL Enforcement

- [x] Add Zod `.refine()` on `DATABASE_URL` rejecting non-localhost URLs without `sslmode=`
- [x] Update `buildDatabaseUrl()` to append `?sslmode=require` for non-localhost hosts

#### Cross-Tenant Test

- [x] Integration test: two users, `SET LOCAL` to user A, assert cannot read user B's `billing_accounts`
- [x] Integration test: `SET LOCAL` to user A, assert cannot read user B's row in `users`
- [x] Integration test: missing `SET LOCAL` → zero rows returned (not error)
- [x] Integration test: `app_service` role can read both users' data
- [x] Integration test: cross-tenant INSERT rejected by `WITH CHECK` policy
- [x] Integration test: production `withTenantScope` / `setTenantContext` helpers verified

#### Adapter Wiring Gate Test

- [x] Gate test: `DrizzleScheduleManagerAdapter.listSchedules` under RLS-enforced connection (currently failing — adapter does not call `setTenantContext`)
- [x] Gate test: `DrizzleAccountService.getOrCreateBillingAccountForUser` under RLS-enforced connection (currently failing — 42501 WITH CHECK rejection)
- [x] Sanity checks: superuser reads seeded schedule and billing account (proves data exists, failure is from RLS)

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: Audit + Hardening

- [ ] Separate migrator role from runtime role (currently both use `app_user` as DB owner)
- [ ] Transfer DB ownership away from `app_user` to a dedicated admin role (fixes PG 15+ `REVOKE CREATE` no-op)
- [ ] Credential rotation support: `provision.sh` should `ALTER ROLE ... PASSWORD` for existing roles, not skip them
- [ ] Add `pg_audit` or application-level query logging for RLS-filtered queries
- [ ] Add `sslmode=verify-full` support with CA cert for production
- [ ] Evaluate `pgcrypto` for column-level encryption on `schedules.input` (may contain secrets)
- [ ] Restrict `app_service` grants to only the tables the scheduler actually needs (`execution_grants`, `schedules`, `schedule_runs`, `execution_requests`) instead of all tables
- [ ] Evaluate `SECURITY DEFINER` functions for the SIWE auth lookup as an alternative to using `app_service` role in the auth callback
- [ ] **Enforce real role separation in dev**: see design decision 7
- [ ] Organize service-account (BYPASSRLS) adapters into a `worker/` subdirectory within `packages/db-client/src/adapters/`, so they are not confused with user-facing (RLS-enforced) adapters. Affected: `DrizzleScheduleWorkerAdapter`, `DrizzleExecutionGrantWorkerAdapter`, `DrizzleScheduleRunAdapter` (currently co-located with user adapters in the same files).

### P2: Per-Table Optimization (Do NOT Build Yet)

- [ ] Evaluate denormalizing `owner_user_id` onto transitive tables to avoid subquery policies
- [ ] Evaluate policy performance at >10k users with EXPLAIN ANALYZE
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

| File                                                         | Change                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `platform/infra/services/runtime/postgres-init/provision.sh` | Add DML grants, `app_service` role, `ALTER DEFAULT PRIVILEGES`     |
| `src/adapters/server/db/migrations/0004_enable_rls.sql`      | RLS + policies on 10 tables (hand-written SQL migration)           |
| `packages/db-schema/src/index.ts`                            | Root barrel re-exporting all schema slices                         |
| `packages/db-client/src/client.ts`                           | `createAppDbClient` (app-role, root export)                        |
| `packages/db-client/src/service.ts`                          | `createServiceDbClient` (service-role, `./service` sub-path only)  |
| `packages/db-client/src/build-client.ts`                     | Shared `buildClient()` factory + `Database` type                   |
| `packages/ids/src/index.ts`                                  | `UserId`, `ActorId`, `toUserId`, `userActor` branded types         |
| `packages/ids/src/system.ts`                                 | `SYSTEM_ACTOR: ActorId` (sub-path gated)                           |
| `packages/db-client/src/tenant-scope.ts`                     | `withTenantScope` + `setTenantContext` (accept `ActorId`)          |
| `src/adapters/server/db/drizzle.client.ts`                   | `getDb()` singleton (app-role only)                                |
| `src/adapters/server/db/drizzle.service-client.ts`           | `getServiceDb()` singleton (BYPASSRLS, depcruiser-gated)           |
| `src/adapters/server/db/tenant-scope.ts`                     | Re-exports from `@cogni/db-client`                                 |
| `src/shared/db/db-url.ts`                                    | Append `?sslmode=require` for non-localhost URLs                   |
| `src/shared/env/server.ts`                                   | Add Zod refine rejecting non-localhost URLs without `sslmode`      |
| `tests/integration/db/rls-tenant-isolation.int.test.ts`      | Cross-tenant isolation + missing-context tests                     |
| `tests/integration/db/rls-adapter-wiring.int.test.ts`        | Adapter wiring gate (failing until adapters call setTenantContext) |

## File Pointers (Adapter Wiring)

### Commit 2: Schedule + Grant

| File                                                          | Change                                                        | Done |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ---- |
| `packages/scheduler-core/src/ports/schedule-manager.port.ts`  | Split → `ScheduleUserPort` + `ScheduleWorkerPort`             | [x]  |
| `packages/scheduler-core/src/ports/execution-grant.port.ts`   | Split → `ExecutionGrantUserPort` + `ExecutionGrantWorkerPort` | [x]  |
| `packages/scheduler-core/src/ports/schedule-run.port.ts`      | Add `actorId: ActorId` as first param to all methods          | [x]  |
| `packages/scheduler-core/src/ports/index.ts`                  | Re-export split port names                                    | [x]  |
| `packages/db-client/src/adapters/drizzle-schedule.adapter.ts` | Split → User (appDb) + Worker (serviceDb), `withTenantScope`  | [x]  |
| `packages/db-client/src/adapters/drizzle-grant.adapter.ts`    | Split → User (appDb) + Worker (serviceDb), `withTenantScope`  | [x]  |
| `packages/db-client/src/adapters/drizzle-run.adapter.ts`      | Add `actorId`, wrap in `withTenantScope`                      | [x]  |
| `packages/db-client/src/index.ts`                             | Export new adapter classes                                    | [x]  |
| `src/bootstrap/container.ts`                                  | Import `getServiceDb`, wire dual instances                    | [x]  |
| `src/app/api/v1/schedules/route.ts`                           | Use `ScheduleUserPort`, `toUserId(sessionUser.id)`            | [x]  |
| `src/app/api/v1/schedules/[scheduleId]/route.ts`              | Same pattern                                                  | [x]  |
| `src/app/api/internal/graphs/[graphId]/runs/route.ts`         | Use `executionGrantWorkerPort`, pass `SYSTEM_ACTOR`           | [x]  |
| `services/scheduler-worker/src/activities/index.ts`           | Import `SYSTEM_ACTOR` from `@cogni/ids/system`                | [x]  |
| `tests/integration/db/rls-adapter-wiring.int.test.ts`         | Unskip `listSchedules` gate test                              | [x]  |
| `tests/unit/bootstrap/container.spec.ts`                      | Update for new container interface types                      | [ ]  |
| `docs/DATABASE_RLS_SPEC.md`                                   | Mark schedule + grant + run rows `[x]` Wired                  | [x]  |

### Commit 3: Accounts

> **Design change:** Original plan threaded `callerUserId` through features/billing. Actual implementation binds `UserId` once at construction via `accountsForUser(userId)` factory — downstream code receives a pre-scoped `AccountService` with no signature changes. Features/billing/payment services untouched.

| File                                                          | Change                                                                                                                                                            | Done |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `src/ports/accounts.port.ts`                                  | Add `ServiceAccountService` interface (2-method subset for BYPASSRLS callers)                                                                                     | [x]  |
| `src/ports/index.ts`                                          | Re-export `ServiceAccountService`                                                                                                                                 | [x]  |
| `src/adapters/server/accounts/drizzle.adapter.ts`             | Split → `UserDrizzleAccountService` (appDb, `withTenantScope`) + `ServiceDrizzleAccountService` (serviceDb, BYPASSRLS). Extract shared helpers to free functions. | [x]  |
| `src/adapters/server/index.ts`                                | Barrel rename `DrizzleAccountService` → `UserDrizzleAccountService`                                                                                               | [x]  |
| `src/bootstrap/container.ts`                                  | `accountsForUser(UserId)` factory + `serviceAccountService` singleton via `getServiceDb()`                                                                        | [x]  |
| `src/bootstrap/graph-executor.factory.ts`                     | Add `userId: UserId` param, pass through to `resolveAiAdapterDeps`                                                                                                | [x]  |
| `src/lib/auth/mapping.ts`                                     | Param type → `Pick<AccountService, 'getOrCreateBillingAccountForUser'>`                                                                                           | [x]  |
| `src/app/_facades/ai/completion.server.ts`                    | `toUserId(sessionUser.id)` at edge → `resolveAiAdapterDeps(userId)` + `createGraphExecutor(…, userId)`                                                            | [x]  |
| `src/app/_facades/ai/activity.server.ts`                      | `resolveActivityDeps(toUserId(sessionUser.id))`                                                                                                                   | [x]  |
| `src/app/_facades/payments/credits.server.ts`                 | `accountsForUser(toUserId(sessionUser.id))`                                                                                                                       | [x]  |
| `src/app/_facades/payments/attempts.server.ts`                | `accountsForUser(toUserId(sessionUser.id))` in all 3 functions                                                                                                    | [x]  |
| `src/app/api/v1/schedules/route.ts`                           | `accountsForUser(toUserId(sessionUser.id))` for billing account lookup                                                                                            | [x]  |
| `src/app/api/internal/graphs/[graphId]/runs/route.ts`         | `serviceAccountService` for billing lookup + `toUserId(grant.userId)` for executor                                                                                | [x]  |
| `tests/_fakes/ids.ts`                                         | Branded UUID test fixtures (`TEST_USER_ID_1..5`, `TEST_SESSION_USER_1..5`)                                                                                        | [x]  |
| `tests/_fakes/accounts/mock-account.service.ts`               | Use `TEST_USER_ID_1` for `ownerUserId`                                                                                                                            | [x]  |
| `tests/unit/adapters/server/accounts/drizzle.adapter.spec.ts` | Update mocks for `UserDrizzleAccountService` constructor + `withTenantScope` tx pattern                                                                           | [x]  |
| `tests/unit/app/_facades/ai/completion.server.spec.ts`        | Use `TEST_SESSION_USER_1` fixtures                                                                                                                                | [x]  |
| `tests/unit/app/_facades/payments/credits.server.spec.ts`     | Use `TEST_SESSION_USER_1` + fix container mock (`accountsForUser` factory)                                                                                        | [x]  |
| `tests/unit/app/activity.facade.billing-display.spec.ts`      | Use `TEST_SESSION_USER_1..3` fixtures                                                                                                                             | [x]  |
| `tests/contract/app/ai.activity.facade.test.ts`               | Use `TEST_SESSION_USER_1` fixture                                                                                                                                 | [x]  |
| `tests/contract/app/ai.completion.facade.test.ts`             | Use `TEST_SESSION_USER_1` fixture                                                                                                                                 | [x]  |
| `tests/integration/db/rls-adapter-wiring.int.test.ts`         | Unskip `getOrCreateBillingAccountForUser` gate test                                                                                                               | [x]  |
| `docs/DATABASE_RLS_SPEC.md`                                   | Update tracker to reflect actual implementation                                                                                                                   | [x]  |

**Files intentionally NOT changed** (no `callerUserId` threading needed with construction-time binding):
`src/features/ai/services/billing.ts`, `src/adapters/server/ai/inproc-completion-unit.adapter.ts`, `src/features/ai/services/preflight-credit-check.ts`, `src/features/payments/services/creditsConfirm.ts`, `src/features/payments/services/creditsSummary.ts`

### Commit 4: Payment Attempts

> **Design change:** Follows the Commit 3 construction-time binding pattern. `UserDrizzlePaymentAttemptRepository(appDb, userId)` binds `actorId = userActor(userId)` at construction; every method wraps in `withTenantScope`. Service methods on `ServiceDrizzlePaymentAttemptRepository(serviceDb)` include `billingAccountId` in WHERE clauses as defense-in-depth tenant anchor.

| File                                                              | Change                                                                                         | Done |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---- |
| `src/ports/payment-attempt.port.ts`                               | Split → `PaymentAttemptUserRepository` + `PaymentAttemptServiceRepository`                     | [x]  |
| `src/adapters/server/payments/drizzle-payment-attempt.adapter.ts` | Split → User (appDb, `withTenantScope`) + Service (serviceDb, BYPASSRLS)                       | [x]  |
| `src/features/payments/services/paymentService.ts`                | Dual-repo params (`userRepo` + `serviceRepo`)                                                  | [x]  |
| `src/app/_facades/payments/attempts.server.ts`                    | `paymentAttemptsForUser(toUserId(...))` + `paymentAttemptServiceRepository` from container     | [x]  |
| `src/bootstrap/container.ts`                                      | `paymentAttemptsForUser` factory + `paymentAttemptServiceRepository` singleton via `serviceDb` | [x]  |
| `docs/DATABASE_RLS_SPEC.md`                                       | Mark all remaining rows `[x]` Wired, update status line                                        | [x]  |

---

## Policy Design

### Self-Only Policy (users table)

The `users` table contains PII (email, wallet address). Self-only read/write:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY self_isolation ON users
  USING (id = current_setting('app.current_user_id', true))
  WITH CHECK (id = current_setting('app.current_user_id', true));
```

**Auth bootstrap edge case:** The SIWE login flow (`src/auth.ts`) queries `users` by `wallet_address` _before_ the user ID is known, and inserts new users on first login. These operations run before `app.current_user_id` can be set. The auth adapter must use the `app_service` role (or a `SECURITY DEFINER` lookup function) for the SIWE credential verification callback. All post-login queries use `app_user` with `SET LOCAL`.

### Tables with Direct User FK

These tables have `owner_user_id` or `user_id` columns:

```sql
-- billing_accounts: ownerUserId → users.id
ALTER TABLE billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON billing_accounts
  USING (owner_user_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id = current_setting('app.current_user_id', true));

-- execution_grants: userId → users.id
CREATE POLICY tenant_isolation ON execution_grants
  USING (user_id = current_setting('app.current_user_id', true))
  WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- schedules: ownerUserId → users.id
CREATE POLICY tenant_isolation ON schedules
  USING (owner_user_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id = current_setting('app.current_user_id', true));
```

### Tables with Transitive User FK (via billing_accounts)

These tables have `billing_account_id` FK. Policy uses subquery:

```sql
-- virtual_keys, credit_ledger, charge_receipts, payment_attempts
CREATE POLICY tenant_isolation ON virtual_keys
  USING (billing_account_id IN (
    SELECT id FROM billing_accounts
    WHERE owner_user_id = current_setting('app.current_user_id', true)
  ))
  WITH CHECK (billing_account_id IN (
    SELECT id FROM billing_accounts
    WHERE owner_user_id = current_setting('app.current_user_id', true)
  ));
-- Same pattern for credit_ledger, charge_receipts, payment_attempts
```

### Tables with Deep Transitive FK (via payment_attempts)

```sql
-- payment_events: attemptId → payment_attempts → billing_accounts
CREATE POLICY tenant_isolation ON payment_events
  USING (attempt_id IN (
    SELECT id FROM payment_attempts
    WHERE billing_account_id IN (
      SELECT id FROM billing_accounts
      WHERE owner_user_id = current_setting('app.current_user_id', true)
    )
  ))
  WITH CHECK (attempt_id IN (
    SELECT id FROM payment_attempts
    WHERE billing_account_id IN (
      SELECT id FROM billing_accounts
      WHERE owner_user_id = current_setting('app.current_user_id', true)
    )
  ));

-- schedule_runs: scheduleId → schedules → users
CREATE POLICY tenant_isolation ON schedule_runs
  USING (schedule_id IN (
    SELECT id FROM schedules
    WHERE owner_user_id = current_setting('app.current_user_id', true)
  ))
  WITH CHECK (schedule_id IN (
    SELECT id FROM schedules
    WHERE owner_user_id = current_setting('app.current_user_id', true)
  ));
```

### Tables Exempt from RLS

| Table                     | Reason                                |
| ------------------------- | ------------------------------------- |
| `ai_invocation_summaries` | No user FK; pure telemetry; no PII    |
| `execution_requests`      | No user FK; idempotency layer; no PII |

---

## Design Decisions

### 1. `current_setting` with `true` (Missing-OK)

`current_setting('app.current_user_id', true)` returns `NULL` when the setting is unset. Since no row has `owner_user_id = NULL`, unset context returns zero rows — silent deny, not an error. This is intentional: a forgotten `SET LOCAL` fails safe.

### 2. Why Subquery Policies (Not Denormalization)

Adding `owner_user_id` to every transitive table would simplify policies to direct column checks. We defer this because:

- Current table count is small (9 tables)
- Subquery policies are correct and readable
- Denormalization adds write-time consistency burden
- P2 evaluates this if query plans show sequential scans

### 3. Two Application Roles

| Role          | RLS      | Use                                 |
| ------------- | -------- | ----------------------------------- |
| `app_user`    | Enforced | Web app requests (Next.js runtime)  |
| `app_service` | Bypassed | Scheduler worker, internal services |

Both roles have identical DML grants. Only RLS behavior differs. This avoids "god mode" in the application while allowing cross-tenant operations in trusted internal services.

### 4. Alignment with USAGE_HISTORY.md

`USAGE_HISTORY.md` uses `app.current_account_id` for the `run_artifacts` table. This spec uses `app.current_user_id` because the tenant boundary is `users.id`, not `billing_accounts.id`. When `run_artifacts` is implemented, it should use `app.current_user_id` for consistency (its `account_id` column maps to `billing_accounts.id`, which is 1:1 with `users.id` via the UNIQUE constraint).

**Decision:** Standardize on `app.current_user_id` as the single RLS session variable. Update `USAGE_HISTORY.md` to align when that feature is implemented.

### 5. Dual DB Client with Sub-Path Isolation

`packages/db-client` uses sub-path exports to separate safe and dangerous factories:

- **Root (`@cogni/db-client`):** `createAppDbClient(url)`, `withTenantScope`, `setTenantContext`, `Database` type. Branded ID types (`UserId`, `ActorId`, `toUserId`, `userActor`) live in `@cogni/ids`.
- **Sub-path (`@cogni/db-client/service`):** `createServiceDbClient(url)` (app_service, BYPASSRLS). NOT re-exported from root.
- **IDs (`@cogni/ids`):** `UserId`, `ActorId`, `toUserId`, `userActor`. Sub-path `@cogni/ids/system` exports `SYSTEM_ACTOR: ActorId` — NOT in root, enforcing import-boundary safety.

At the adapter layer, singletons are also split:

- `src/adapters/server/db/drizzle.client.ts` → `getDb()` (app-role, in barrel)
- `src/adapters/server/db/drizzle.service-client.ts` → `getServiceDb()` (service-role, NOT in barrel)

**Enforcement (two layers):**

1. **Adapter gate (enforced):** Depcruiser rule `no-service-db-adapter-import` restricts `drizzle.service-client.ts` imports to `src/auth.ts` and `src/bootstrap/container.ts` only. Proven working via arch probe and `pnpm arch:check`.
2. **Package gate (dormant):** Depcruiser rule `no-service-db-package-import` restricts `@cogni/db-client/service` to `drizzle.service-client.ts` only. Currently not enforceable because depcruiser cannot resolve pnpm workspace sub-path exports (imports silently vanish from the graph). Becomes enforceable if depcruiser adds workspace resolution support.
3. **Type gate (enforced):** `SYSTEM_ACTOR` is exported only from `@cogni/ids/system`. User-facing ports accept `UserId`; worker ports accept `ActorId`. Branded types prevent cross-boundary misuse at compile time.
4. **Environmental (defense-in-depth):** `DATABASE_SERVICE_URL` required in all environments (enforced by Zod schema in `server.ts`).

### 6. `users.id` UUID Assumption

`@cogni/ids` validates raw strings against `UUID_RE` at brand construction time (`toUserId`). `tenant-scope.ts` accepts only branded `ActorId` and interpolates via `sql.raw()`. The `users.id` column is `text`, not `uuid` — so the schema allows non-UUID values. The UUID validation is a defense-in-depth measure against SQL injection (SET LOCAL cannot use `$1` parameterized placeholders). If user IDs ever deviate from UUID format, `toUserId` will reject them.

---

### 7. - [ ] **Dev parity: enforce real DB role separation**

      Local dev MUST provision and use two distinct DB roles:
      - DATABASE_URL  -> app_user (RLS enforced)
      - DATABASE_SERVICE_URL -> app_service (BYPASSRLS)

      Requirements:
      1) docker-compose brings up Postgres, then runs provisioning (idempotent) that creates roles/grants/policies BEFORE Next.js starts.
      2) App consumes TWO explicit DSN secrets only (no ${APP_DB_USER}_service concatenation; no fallback; no DSN construction in runtime code).
      3) `.env.local.example` shows two different DSNs with different users (and uses the provisioned roles).
      4) Startup invariants hard-fail if:
         - DATABASE_URL.user == DATABASE_SERVICE_URL.user
         - either DSN user is postgres/root/superuser
         - either DSN is missing

## Adapter Wiring Tracker

Methods that touch user-scoped tables and need `withTenantScope` / `setTenantContext` wiring. Exempt adapters (`DrizzleAiTelemetryAdapter`, `DrizzleExecutionRequestAdapter`) are omitted.

**Legend — userId availability:**

- **Direct**: method already receives `userId` / `callerUserId`
- **Via billingAccountId**: caller has it, `SET LOCAL` uses the owning userId
- **None**: method has only a resource ID; caller must supply userId or use service-role bypass

### `UserDrizzleAccountService` (`src/adapters/server/accounts/drizzle.adapter.ts`)

> Renamed from `DrizzleAccountService`. UserId bound at construction; `actorId = userActor(userId)` derived once. Every method wraps in `withTenantScope(this.db, this.actorId, tx => …)`. `ServiceDrizzleAccountService` (serviceDb, BYPASSRLS) exposes only `getBillingAccountById` and `getOrCreateBillingAccountForUser`.

| Method                                                   | Tables                                                 | Txn? | userId source                     | Wired? |
| -------------------------------------------------------- | ------------------------------------------------------ | ---- | --------------------------------- | ------ |
| `getOrCreateBillingAccountForUser({ userId })`           | `billing_accounts`, `virtual_keys`                     | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `getBillingAccountById(billingAccountId)`                | `billing_accounts`, `virtual_keys`                     | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `getBalance(billingAccountId)`                           | `billing_accounts`                                     | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `debitForUsage({ billingAccountId, … })`                 | `billing_accounts`, `credit_ledger`                    | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `recordChargeReceipt(params)`                            | `charge_receipts`, `billing_accounts`, `credit_ledger` | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `creditAccount({ billingAccountId, … })`                 | `billing_accounts`, `credit_ledger`                    | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `listCreditLedgerEntries({ billingAccountId })`          | `credit_ledger`                                        | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `findCreditLedgerEntryByReference({ billingAccountId })` | `credit_ledger`                                        | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `listChargeReceipts({ billingAccountId, … })`            | `charge_receipts`                                      | Yes  | Constructor (`userActor(userId)`) | [x]    |

### `UserDrizzlePaymentAttemptRepository` (`src/adapters/server/payments/drizzle-payment-attempt.adapter.ts`)

> UserId bound at construction; `actorId = userActor(userId)` derived once. Every method wraps in `withTenantScope(this.db, this.actorId, tx => …)`.

| Method                           | Tables                               | Txn? | userId source                     | Wired? |
| -------------------------------- | ------------------------------------ | ---- | --------------------------------- | ------ |
| `create(params)`                 | `payment_attempts`, `payment_events` | Yes  | Constructor (`userActor(userId)`) | [x]    |
| `findById(id, billingAccountId)` | `payment_attempts`                   | Yes  | Constructor (`userActor(userId)`) | [x]    |

### `ServiceDrizzlePaymentAttemptRepository` (`src/adapters/server/payments/drizzle-payment-attempt.adapter.ts`)

> Uses serviceDb (BYPASSRLS). All mutators include `billingAccountId` in WHERE clause as defense-in-depth tenant anchor.

| Method                                               | Tables                               | Txn? | userId source            | Wired? |
| ---------------------------------------------------- | ------------------------------------ | ---- | ------------------------ | ------ |
| `findByTxHash(chainId, txHash)`                      | `payment_attempts`                   | No   | None (cross-user lookup) | [x]    |
| `updateStatus(id, billingAccountId, status)`         | `payment_attempts`, `payment_events` | Yes  | Via billingAccountId     | [x]    |
| `bindTxHash(id, billingAccountId, txHash, …)`        | `payment_attempts`, `payment_events` | Yes  | Via billingAccountId     | [x]    |
| `recordVerificationAttempt(id, billingAccountId, …)` | `payment_attempts`, `payment_events` | Yes  | Via billingAccountId     | [x]    |
| `logEvent(params)`                                   | `payment_events`                     | No   | None (event-only)        | [x]    |

### `DrizzleExecutionGrantUserAdapter` (`packages/db-client/…/drizzle-grant.adapter.ts`)

| Method                                 | Tables             | Txn? | userId source | Wired? |
| -------------------------------------- | ------------------ | ---- | ------------- | ------ |
| `createGrant({ userId: UserId, … })`   | `execution_grants` | No   | Direct        | [x]    |
| `revokeGrant(callerUserId: UserId, …)` | `execution_grants` | No   | Direct        | [x]    |
| `deleteGrant(callerUserId: UserId, …)` | `execution_grants` | No   | Direct        | [x]    |

### `DrizzleExecutionGrantWorkerAdapter` (`packages/db-client/…/drizzle-grant.adapter.ts`)

| Method                                                      | Tables             | Txn? | userId source          | Wired? |
| ----------------------------------------------------------- | ------------------ | ---- | ---------------------- | ------ |
| `validateGrant(actorId: ActorId, grantId)`                  | `execution_grants` | No   | ActorId (SYSTEM_ACTOR) | [x]    |
| `validateGrantForGraph(actorId: ActorId, grantId, graphId)` | `execution_grants` | No   | ActorId (SYSTEM_ACTOR) | [x]    |

### `DrizzleScheduleUserAdapter` (`packages/db-client/…/drizzle-schedule.adapter.ts`)

| Method                                    | Tables                          | Txn? | userId source | Wired? |
| ----------------------------------------- | ------------------------------- | ---- | ------------- | ------ |
| `createSchedule(callerUserId: UserId, …)` | `schedules`, `execution_grants` | Yes  | Direct        | [x]    |
| `listSchedules(callerUserId: UserId)`     | `schedules`                     | No   | Direct        | [x]    |
| `getSchedule(callerUserId: UserId, …)`    | `schedules`                     | No   | Direct        | [x]    |
| `updateSchedule(callerUserId: UserId, …)` | `schedules`                     | Yes  | Direct        | [x]    |
| `deleteSchedule(callerUserId: UserId, …)` | `schedules`, `execution_grants` | Yes  | Direct        | [x]    |

### `DrizzleScheduleWorkerAdapter` (`packages/db-client/…/drizzle-schedule.adapter.ts`)

| Method                                      | Tables      | Txn? | userId source          | Wired? |
| ------------------------------------------- | ----------- | ---- | ---------------------- | ------ |
| `getScheduleForWorker(actorId: ActorId, …)` | `schedules` | No   | ActorId (SYSTEM_ACTOR) | [x]    |
| `updateNextRunAt(actorId: ActorId, …)`      | `schedules` | No   | ActorId (SYSTEM_ACTOR) | [x]    |
| `updateLastRunAt(actorId: ActorId, …)`      | `schedules` | No   | ActorId (SYSTEM_ACTOR) | [x]    |
| `findStaleSchedules(actorId: ActorId)`      | `schedules` | No   | ActorId (SYSTEM_ACTOR) | [x]    |

### `DrizzleScheduleRunAdapter` (`packages/db-client/…/drizzle-run.adapter.ts`)

| Method                                         | Tables          | Txn? | userId source          | Wired? |
| ---------------------------------------------- | --------------- | ---- | ---------------------- | ------ |
| `createRun(actorId: ActorId, { … })`           | `schedule_runs` | No   | ActorId (SYSTEM_ACTOR) | [x]    |
| `markRunStarted(actorId: ActorId, runId, …)`   | `schedule_runs` | No   | ActorId (SYSTEM_ACTOR) | [x]    |
| `markRunCompleted(actorId: ActorId, runId, …)` | `schedule_runs` | No   | ActorId (SYSTEM_ACTOR) | [x]    |

### Special: SIWE Auth Callback (`src/auth.ts`)

| Method                        | Tables  | Txn? | userId source                           | Wired? |
| ----------------------------- | ------- | ---- | --------------------------------------- | ------ |
| `authorize(credentials, req)` | `users` | No   | None (pre-auth — uses `getServiceDb()`) | [x]    |

---

## Related Documents

- [DATABASES.md](DATABASES.md) — Two-user model, migration strategy
- [RBAC_SPEC.md](RBAC_SPEC.md) — Application-layer authorization (OpenFGA)
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — RLS precedent for `run_artifacts` table
- [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md) — Authentication (SIWE, JWT sessions)
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal layers, adapter patterns

---

**Last Updated**: 2026-02-05
**Status**: P0 In Progress — Commits 1–4 done (dual DB client, schedules/grants, accounts, payment attempts wired). Commit 5: deleted deprecated `DrizzleUsageAdapter` (replaced by `LiteLlmUsageServiceAdapter`), deleted deprecated `createDbClient` (replaced by `createServiceDbClient` in scheduler-worker). Remaining: observability instrumentation, documentation updates.
