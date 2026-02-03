# Database Row-Level Security Design

> [!CRITICAL]
> Every user-scoped table enforces tenant isolation via PostgreSQL RLS keyed on `current_setting('app.current_user_id')`. The application sets this per-transaction with `SET LOCAL`. Missing setting = deny all.

## Core Invariants

1. **RLS_ON_USER_TABLES**: The `users` table and all tables with a direct or transitive FK to `users.id` MUST have RLS enabled and forced (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY; ALTER TABLE ... FORCE ROW LEVEL SECURITY`). Standalone telemetry/idempotency tables are exempt.

2. **SET_LOCAL_PER_TRANSACTION**: Every application database call runs inside an explicit `BEGIN`/`COMMIT` transaction. The first statement is `SET LOCAL app.current_user_id = $1` where `$1` is the authenticated user ID from the session JWT. Without an explicit transaction, PostgreSQL autocommit wraps each statement in its own implicit transaction — so `SET LOCAL` would apply only to itself and be lost before the next query. This is the safety net: forgetting the wrapper means queries run with no `app.current_user_id` set, and RLS returns zero rows.

3. **SERVICE_ROLE_BYPASSES_RLS**: A dedicated `app_service` PostgreSQL role (used by scheduler workers and internal services) has `BYPASSRLS`. The standard `app_user` role does not. Two roles, same database, different RLS enforcement.

4. **LEAST_PRIVILEGE_APP_ROLE**: The `app_user` role has `SELECT, INSERT, UPDATE, DELETE` on application tables only. No `DROP`, `TRUNCATE`, `CREATE`, `ALTER`. Migrations run as root, never as `app_user`.

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
- [ ] Wire into all DB adapter methods that touch user-scoped tables
- [ ] Ensure `userId` originates from session JWT (server-side), never from request body

#### SSL Enforcement

- [x] Add Zod `.refine()` on `DATABASE_URL` rejecting non-localhost URLs without `sslmode=`
- [x] Update `buildDatabaseUrl()` to append `?sslmode=require` for non-localhost hosts

#### Cross-Tenant Test

- [x] Integration test: two users, `SET LOCAL` to user A, assert cannot read user B's `billing_accounts`
- [x] Integration test: `SET LOCAL` to user A, assert cannot read user B's row in `users`
- [x] Integration test: missing `SET LOCAL` → zero rows returned (not error)
- [ ] Integration test: `app_service` role can read both users' data

#### Chores

- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation updates [document.md](../.agent/workflows/document.md)

### P1: Audit + Hardening

- [ ] Add `pg_audit` or application-level query logging for RLS-filtered queries
- [ ] Add `sslmode=verify-full` support with CA cert for production
- [ ] Evaluate `pgcrypto` for column-level encryption on `schedules.input` (may contain secrets)
- [ ] Restrict `app_service` grants to only the tables the scheduler actually needs (`execution_grants`, `schedules`, `schedule_runs`, `execution_requests`) instead of all tables
- [ ] Evaluate `SECURITY DEFINER` functions for the SIWE auth lookup as an alternative to using `app_service` role in the auth callback

### P2: Per-Table Optimization (Do NOT Build Yet)

- [ ] Evaluate denormalizing `owner_user_id` onto transitive tables to avoid subquery policies
- [ ] Evaluate policy performance at >10k users with EXPLAIN ANALYZE
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

| File                                                         | Change                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------- |
| `platform/infra/services/runtime/postgres-init/provision.sh` | Add DML grants, `app_service` role, `ALTER DEFAULT PRIVILEGES` |
| `src/adapters/server/db/migrations/0004_enable_rls.sql`      | RLS + policies on 10 tables (hand-written SQL migration)       |
| `src/adapters/server/db/tenant-scope.ts`                     | `withTenantScope(userId, fn)` + `setTenantContext(tx, userId)` |
| `src/adapters/server/db/client.ts`                           | Re-exports tenant-scope helpers                                |
| `src/shared/db/db-url.ts`                                    | Append `?sslmode=require` for non-localhost URLs               |
| `src/shared/env/server.ts`                                   | Add Zod refine rejecting non-localhost URLs without `sslmode`  |
| `tests/integration/db/rls-tenant-isolation.int.test.ts`      | New: cross-tenant isolation + missing-context tests            |

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

### 5. `tenant-scope.ts` Lives in `src/adapters/server/db/`, Not `packages/db-client/`

The `withTenantScope` / `setTenantContext` helpers live in the web-app adapter layer, not the `@cogni/db-client` package, because:

- **Dependency boundary:** `packages/` cannot import `src/` (enforced by dependency-cruiser). The helpers use the full-schema `Database` type from `src/adapters/server/db/drizzle.client.ts`.
- **Type incompatibility:** `@cogni/db-client` defines `Database` over `schedulingSchema` only. The app defines `Database` over the full schema. These are different types.
- **Tenant scoping is a web-app concern.** The scheduler worker runs as `app_service` (BYPASSRLS) and never sets `app.current_user_id`. Only request-scoped web-app code needs tenant context.

**When this might change:** If a second user-facing service (not the scheduler) needs to share the same database with RLS enforcement, the helpers should move to a shared package (e.g., `@cogni/db-rls`) that defines a schema-agnostic `withTenantScope<Db>(db: Db, userId, fn)` generic. Until then, one consumer = one location.

---

## Adapter Wiring Tracker

Methods that touch user-scoped tables and need `withTenantScope` / `setTenantContext` wiring. Exempt adapters (`DrizzleAiTelemetryAdapter`, `DrizzleExecutionRequestAdapter`) are omitted.

**Legend — userId availability:**

- **Direct**: method already receives `userId` / `callerUserId`
- **Via billingAccountId**: caller has it, `SET LOCAL` uses the owning userId
- **None**: method has only a resource ID; caller must supply userId or use service-role bypass

### `DrizzleAccountService` (`src/adapters/server/accounts/drizzle.adapter.ts`)

| Method                                                   | Tables                                                 | Txn? | userId source        | Wired? |
| -------------------------------------------------------- | ------------------------------------------------------ | ---- | -------------------- | ------ |
| `getOrCreateBillingAccountForUser({ userId })`           | `billing_accounts`, `virtual_keys`                     | Yes  | Direct               | [ ]    |
| `getBillingAccountById(billingAccountId)`                | `billing_accounts`, `virtual_keys`                     | No   | Via billingAccountId | [ ]    |
| `getBalance(billingAccountId)`                           | `billing_accounts`                                     | No   | Via billingAccountId | [ ]    |
| `debitForUsage({ billingAccountId, … })`                 | `billing_accounts`, `credit_ledger`                    | Yes  | Via billingAccountId | [ ]    |
| `recordChargeReceipt(params)`                            | `charge_receipts`, `billing_accounts`, `credit_ledger` | Yes  | Via billingAccountId | [ ]    |
| `creditAccount({ billingAccountId, … })`                 | `billing_accounts`, `credit_ledger`                    | Yes  | Via billingAccountId | [ ]    |
| `listCreditLedgerEntries({ billingAccountId })`          | `credit_ledger`                                        | No   | Via billingAccountId | [ ]    |
| `findCreditLedgerEntryByReference({ billingAccountId })` | `credit_ledger`                                        | No   | Via billingAccountId | [ ]    |
| `listChargeReceipts({ billingAccountId, … })`            | `charge_receipts`                                      | No   | Via billingAccountId | [ ]    |

### `DrizzleUsageAdapter` (`src/adapters/server/accounts/drizzle.usage.adapter.ts`) — deprecated

| Method                                   | Tables            | Txn? | userId source        | Wired? |
| ---------------------------------------- | ----------------- | ---- | -------------------- | ------ |
| `getUsageStats({ billingAccountId, … })` | `charge_receipts` | No   | Via billingAccountId | [ ]    |
| `listUsageLogs({ billingAccountId, … })` | `charge_receipts` | No   | Via billingAccountId | [ ]    |

### `DrizzlePaymentAttemptRepository` (`src/adapters/server/payments/drizzle-payment-attempt.adapter.ts`)

| Method                             | Tables                               | Txn? | userId source            | Wired? |
| ---------------------------------- | ------------------------------------ | ---- | ------------------------ | ------ |
| `create(params)`                   | `payment_attempts`, `payment_events` | Yes  | Via billingAccountId     | [ ]    |
| `findById(id, billingAccountId)`   | `payment_attempts`                   | No   | Via billingAccountId     | [ ]    |
| `findByTxHash(chainId, txHash)`    | `payment_attempts`                   | No   | None (cross-user lookup) | [ ]    |
| `updateStatus(id, status)`         | `payment_attempts`, `payment_events` | Yes  | None (internal)          | [ ]    |
| `bindTxHash(id, txHash, …)`        | `payment_attempts`, `payment_events` | Yes  | None (internal)          | [ ]    |
| `recordVerificationAttempt(id, …)` | `payment_attempts`, `payment_events` | Yes  | None (internal)          | [ ]    |
| `logEvent(params)`                 | `payment_events`                     | No   | None (event-only)        | [ ]    |

### `DrizzleExecutionGrantAdapter` (`packages/db-client/…/drizzle-grant.adapter.ts`)

| Method                                    | Tables             | Txn? | userId source         | Wired? |
| ----------------------------------------- | ------------------ | ---- | --------------------- | ------ |
| `createGrant({ userId, … })`              | `execution_grants` | No   | Direct                | [ ]    |
| `validateGrant(grantId)`                  | `execution_grants` | No   | None (returns userId) | [ ]    |
| `validateGrantForGraph(grantId, graphId)` | `execution_grants` | No   | None (delegates)      | [ ]    |
| `revokeGrant(grantId)`                    | `execution_grants` | No   | None                  | [ ]    |
| `deleteGrant(grantId)`                    | `execution_grants` | No   | None                  | [ ]    |

### `DrizzleScheduleManagerAdapter` (`packages/db-client/…/drizzle-schedule.adapter.ts`)

| Method                            | Tables                          | Txn? | userId source                      | Wired? |
| --------------------------------- | ------------------------------- | ---- | ---------------------------------- | ------ |
| `createSchedule(callerUserId, …)` | `schedules`, `execution_grants` | Yes  | Direct                             | [ ]    |
| `listSchedules(callerUserId)`     | `schedules`                     | No   | Direct                             | [ ]    |
| `getSchedule(scheduleId)`         | `schedules`                     | No   | None (returns ownerUserId)         | [ ]    |
| `updateSchedule(callerUserId, …)` | `schedules`                     | Yes  | Direct                             | [ ]    |
| `deleteSchedule(callerUserId, …)` | `schedules`, `execution_grants` | Yes  | Direct                             | [ ]    |
| `updateNextRunAt(scheduleId, …)`  | `schedules`                     | No   | None (worker path — `app_service`) | [ ]    |
| `updateLastRunAt(scheduleId, …)`  | `schedules`                     | No   | None (worker path — `app_service`) | [ ]    |
| `findStaleSchedules()`            | `schedules`                     | No   | None (system scan — `app_service`) | [ ]    |

### `DrizzleScheduleRunAdapter` (`packages/db-client/…/drizzle-run.adapter.ts`)

| Method                         | Tables          | Txn? | userId source                      | Wired? |
| ------------------------------ | --------------- | ---- | ---------------------------------- | ------ |
| `createRun({ scheduleId, … })` | `schedule_runs` | No   | None (worker path — `app_service`) | [ ]    |
| `markRunStarted(runId)`        | `schedule_runs` | No   | None (worker path — `app_service`) | [ ]    |
| `markRunCompleted(runId, …)`   | `schedule_runs` | No   | None (worker path — `app_service`) | [ ]    |

### Special: SIWE Auth Callback (`src/auth.ts`)

| Method                        | Tables  | Txn? | userId source                            | Wired? |
| ----------------------------- | ------- | ---- | ---------------------------------------- | ------ |
| `authorize(credentials, req)` | `users` | No   | None (pre-auth — must use `app_service`) | [ ]    |

---

## Related Documents

- [DATABASES.md](DATABASES.md) — Two-user model, migration strategy
- [RBAC_SPEC.md](RBAC_SPEC.md) — Application-layer authorization (OpenFGA)
- [USAGE_HISTORY.md](USAGE_HISTORY.md) — RLS precedent for `run_artifacts` table
- [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md) — Authentication (SIWE, JWT sessions)
- [ARCHITECTURE.md](ARCHITECTURE.md) — Hexagonal layers, adapter patterns

---

**Last Updated**: 2026-02-03
**Status**: P0 Implemented (adapter wiring pending)
