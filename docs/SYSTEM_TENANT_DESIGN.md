# System Tenant & Governance Execution Design

> [!CRITICAL]
> System tenant runs graphs through the **same execution envelope** as customers. Tenant/actor context is **resolved server-side from auth** — never from client payloads. Explicit tool allowlists and spend caps apply to all tenants including system.

## Core Invariants

1. **SYSTEM_IS_TENANT**: The `cogni_system` billing account is a first-class tenant with `is_system_tenant=true`. Governance AI loops execute as runs under this tenant using the unified `GraphExecutorPort`.

2. **CONTEXT_SERVER_RESOLVED**: Tenant context (billingAccountId, actor, policy) is resolved server-side from auth credentials (session, API key, ExecutionGrant, internal token). Client payloads NEVER contain tenant/actor fields. This is enforced at the route/facade layer.

3. **NO_WILDCARD_ALLOWLISTS**: System tenant uses explicit tool allowlists, not `*`. Every tool must be named. This prevents privilege escalation via bugs or tool injection.

4. **BUDGETS_FOR_ALL**: System tenant has high spend caps (not unlimited) + per-tool rate limits + kill switch + alerting on spend spikes. Protects against runaway loops.

5. **EFFECT_LEVEL_GATES**: Tool approval uses existing `ToolPolicy.requireApprovalForEffects` with `ToolEffect` levels, not a boolean. Effects are: `read_only` < `state_change` < `external_side_effect`. Payment/deployment tools should be a separate `privileged_action` level (P1).

6. **RECEIPTS_ALWAYS_EMITTED**: Every billable operation emits a receipt. System tenant runs emit receipts for audit/cost visibility even if not charged externally. Missing receipts is a bug.

7. **DATA_ISOLATION_BY_TENANT**: All persisted data keyed by `billing_account_id`. Customer data NEVER stored under system tenant — even if system-initiated. Existing ACCOUNTS_DESIGN.md Owner vs Actor rules apply.

8. **POLICY_RESOLVER_DEFENSE_IN_DEPTH**: Per GRAPH_EXECUTION.md #26, `configurable.toolIds` is the runtime allowlist enforced by `toLangChainTool`. `PolicyResolverPort.resolvePolicy(tenantId)` provides the **authoritative maximum** allowlist. Tool-runner validates: tool must be in BOTH `configurable.toolIds` AND resolved policy. Route cannot expand beyond PolicyResolverPort; it can only restrict.

9. **TENANT_CONTEXT_REQUIRED**: `ToolPolicyContext.tenantId` is REQUIRED for all production execution paths. Tool-runner MUST deny/throw if `tenantId` is missing. Only tests may omit via explicit `TestPolicyContextBuilder` that documents the bypass.

10. **IS_SYSTEM_TENANT_METADATA_ONLY**: `is_system_tenant` is metadata for selecting default policy — NEVER an authorization branch. No code path may check `if (isSystemTenant) { grant privilege }`. Privilege comes from the resolved policy's allowlist/effect gates/budgets, not the boolean.

11. **SIDE_EFFECT_TOOL_IDEMPOTENCY**: Side-effect tools (broadcast posts, git actions, payments) MUST be idempotent. Adapters require `idempotencyKey = ${tenantId}/${runId}/${toolCallId}` and dedupe at adapter boundary. Retries return cached result, not re-execute.

12. **SYSTEM_TENANT_STARTUP_CHECK**: Application startup MUST verify `cogni_system` billing account exists. Fail fast with clear error if missing — do not fail at runtime when governance loop attempts to run.

---

## What Already Exists

The codebase already has the primitives needed:

| Primitive                | Location                                        | Status                                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------- |
| `caller: LlmCaller`      | `GraphRunRequest`                               | ✅ Has `billingAccountId`, `virtualKeyId`                     |
| `ToolPolicy`             | `@cogni/ai-core/tooling/runtime/tool-policy.ts` | ✅ Has `allowedTools`, `requireApprovalForEffects`, `budgets` |
| `ToolEffect`             | `@cogni/ai-core/tooling/types.ts`               | ✅ Has `read_only`, `state_change`, `external_side_effect`    |
| `ToolPolicyContext`      | `@cogni/ai-core/tooling/runtime/tool-policy.ts` | ✅ Has `runId`, notes P1 expansion                            |
| `configurable.toolIds`   | GRAPH_EXECUTION.md #26, TOOL_USE_SPEC.md #23    | ✅ Runtime allowlist enforced by `toLangChainTool`            |
| `ExecutionGrant`         | `src/types/scheduling.ts`                       | ✅ Has `billingAccountId`, `scopes`, `userId`                 |
| `RUNID_SERVER_AUTHORITY` | GRAPH_EXECUTION.md #29                          | ✅ Client runId ignored                                       |

**What's missing:**

| Gap                               | Fix                                              |
| --------------------------------- | ------------------------------------------------ |
| No `is_system_tenant` flag        | Add column to `billing_accounts`                 |
| No `cogni_system` record          | Add idempotent seed + startup healthcheck        |
| No `PolicyResolverPort`           | Add port for authoritative policy resolution     |
| No required `tenantId` in context | Make required + test escape hatch                |
| No side-effect tool idempotency   | Add idempotency key + dedupe at adapter boundary |

---

## Schema

### billing_accounts (extension)

**New column:**

| Column             | Type    | Notes                   |
| ------------------ | ------- | ----------------------- |
| `is_system_tenant` | boolean | NOT NULL, default false |

**Constraint:** `is_system_tenant` is metadata only — no RLS or authorization logic branches on this field.

**System tenant bootstrap (idempotent):**

```sql
-- Run in migration AND seed (idempotent via ON CONFLICT)
INSERT INTO billing_accounts (id, owner_user_id, is_system_tenant, balance_credits, created_at, updated_at)
VALUES ('cogni_system', NULL, true, 0, now(), now())
ON CONFLICT (id) DO NOTHING;
```

**Startup healthcheck:**

```typescript
// In app bootstrap (src/bootstrap/healthchecks.ts)
async function verifySystemTenantExists(db: DbClient): Promise<void> {
  const result = await db.query.billingAccounts.findFirst({
    where: eq(billingAccounts.id, "cogni_system"),
  });
  if (!result) {
    throw new Error(
      "FATAL: cogni_system billing account missing. Run migrations/seeds."
    );
  }
}
```

### ToolPolicyContext (extension)

Extend existing `ToolPolicyContext` with REQUIRED `tenantId`:

```typescript
// @cogni/ai-core/tooling/runtime/tool-policy.ts

export interface ToolPolicyContext {
  readonly runId: string;
  /** REQUIRED: billing_account_id. Tool-runner denies if missing. */
  readonly tenantId: string;
  /** Actor who initiated (audit trail) */
  readonly actorType: "user" | "system" | "webhook";
  readonly actorId: string;
  /** Tool call ID for idempotency key construction */
  readonly toolCallId: string;
}

// Test escape hatch (explicit bypass for unit tests only)
export function createTestPolicyContext(
  overrides: Partial<ToolPolicyContext> & { runId: string }
): ToolPolicyContext {
  return {
    tenantId: "test_tenant",
    actorType: "system",
    actorId: "test",
    toolCallId: "test_call",
    ...overrides,
  };
}
```

### PolicyResolverPort

```typescript
// src/ports/policy-resolver.port.ts

export interface PolicyResolverPort {
  /**
   * Resolve authoritative policy for a tenant.
   * This is the single source of truth — tool-runner calls this, not route-passed toolIds.
   */
  resolvePolicy(tenantId: string): Promise<ToolPolicy>;
}
```

---

## Implementation Checklist

### P0: MVP — System Tenant Foundation

**Schema & Bootstrap:**

- [ ] Add `is_system_tenant` boolean column to `billing_accounts` (default false)
- [ ] Add migration that creates column AND inserts `cogni_system` (idempotent)
- [ ] Add startup healthcheck: fail if `cogni_system` missing
- [ ] Add to `pnpm dev:stack:test:setup`

**PolicyResolverPort (single source of truth):**

- [ ] Create `PolicyResolverPort` interface in `src/ports/`
- [ ] Implement `DrizzlePolicyResolverAdapter` — loads tenant, selects policy based on `is_system_tenant`
- [ ] System tenant policy: explicit allowlist (enumerate governance tools), high budget caps
- [ ] Customer tenant policy: default allowlist, standard budget, `requireApprovalForEffects: ['external_side_effect']`
- [ ] Update tool-runner to call `PolicyResolverPort.resolvePolicy()` — do NOT trust passed `toolIds`

**ToolPolicyContext (required tenantId):**

- [ ] Make `tenantId`, `actorType`, `actorId`, `toolCallId` required fields
- [ ] Add `createTestPolicyContext()` escape hatch for unit tests
- [ ] Update tool-runner to deny/throw if `tenantId` missing (defense in depth)
- [ ] Update providers to populate full context from `caller`

**Side-effect tool idempotency:**

- [ ] Add `tool_execution_results` table: `(idempotency_key PK, result jsonb, created_at)`
- [ ] Idempotency key format: `${tenantId}/${runId}/${toolCallId}`
- [ ] Side-effect tool adapters check table before execute, store result after success
- [ ] On key match: return cached result, do not re-execute

#### Chores

- [ ] Add `tenant_id`, `actor_type` to traces/logs
- [ ] Documentation: update ACCOUNTS_DESIGN.md (done)

### P1: Enhanced Policy & Monitoring

- [ ] Add `privileged_action` to ToolEffect enum (for payments, deployments)
- [ ] Add spend alerting for system tenant (high watermark alerts)
- [ ] Add kill switch for system tenant runs (manual + automatic on spend spike)
- [ ] Add tenant membership table for proper RLS (not owner_user_id based)

### P2: Governance Loops Live

- [ ] Create governance graphs under system tenant
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

| File                                                          | Change                                             |
| ------------------------------------------------------------- | -------------------------------------------------- |
| `src/shared/db/schema.billing.ts`                             | Add `is_system_tenant` column                      |
| `src/adapters/server/db/migrations/XXXX_add_system_tenant.ts` | Migration + idempotent seed                        |
| `src/bootstrap/healthchecks.ts`                               | New: startup check for `cogni_system`              |
| `src/ports/policy-resolver.port.ts`                           | New: `PolicyResolverPort` interface                |
| `src/adapters/server/policy/drizzle-policy-resolver.ts`       | New: policy resolution implementation              |
| `packages/ai-core/src/tooling/runtime/tool-policy.ts`         | Required `tenantId` + test escape hatch            |
| `packages/ai-core/src/tooling/tool-runner.ts`                 | Call PolicyResolverPort, deny if no tenantId       |
| `src/shared/db/schema.tool-execution.ts`                      | New: `tool_execution_results` for idempotency      |
| `src/adapters/server/ai/tool-idempotency.adapter.ts`          | New: idempotency check/store for side-effect tools |

---

## Design Decisions

### 1. Why `is_system_tenant` boolean (not `account_type` enum)?

| Approach                         | Pros                          | Cons                                      | Verdict        |
| -------------------------------- | ----------------------------- | ----------------------------------------- | -------------- |
| `is_system_tenant` boolean       | Simple, clear, boolean checks | Can't add org/team types later            | **Use for P0** |
| `account_type` enum              | Extensible                    | Over-engineering for P0, enum sprawl risk | Defer to P1    |
| Separate `system_accounts` table | Clean separation              | Fragments billing, duplicate schema       | Reject         |

**Rule:** Use boolean for P0. If we need org/team types later, we can add without breaking existing code.

**Guardrail:** `is_system_tenant` is ONLY used to select default policy. Never `if (isSystemTenant) { allow }`.

### 2. Why PolicyResolverPort (defense in depth)?

Per GRAPH_EXECUTION.md #26, `configurable.toolIds` is the existing enforcement via `toLangChainTool`. Adding `PolicyResolverPort` provides defense in depth:

- Route bug could expand toolIds beyond tenant's actual allowlist
- Second gate catches this: PolicyResolverPort returns authoritative max
- Both checks must pass: tool in `configurable.toolIds` AND in resolved policy

**Rule:** `configurable.toolIds` can restrict (subset), but cannot expand beyond what `PolicyResolverPort.resolvePolicy(tenantId)` returns. First gate is existing behavior; second gate is new.

### 3. Why required tenantId (not optional)?

Optional `tenantId` means production code could accidentally execute without tenant context:

- Bypasses billing attribution
- Bypasses policy enforcement
- Silent failure mode

**Rule:** `tenantId` is required. Tests use explicit `createTestPolicyContext()` that documents the bypass.

### 4. Why side-effect tool idempotency?

Without idempotency:

- Graph retry = duplicate GitHub comment
- Stream replay = duplicate broadcast post
- Network timeout + retry = duplicate payment

**Rule:** Side-effect tools use `idempotencyKey = ${tenantId}/${runId}/${toolCallId}`. Adapter checks before execute, stores after success. Mirrors billing idempotency pattern.

### 5. Policy Resolution Flow (Defense in Depth)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Route/Facade (server-side)                                          │
│ ────────────────────────────                                        │
│ 1. Authenticate: session → userId, API key → billingAccountId, etc │
│ 2. Build caller: { billingAccountId, virtualKeyId }                 │
│ 3. Build configurable: { toolIds: [...], model, ... }               │
│ 4. Call graphExecutor.runGraph({ ..., caller, configurable })       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ toLangChainTool (per GRAPH_EXECUTION.md #26) — FIRST GATE           │
│ ─────────────────────────────────────────────────────────           │
│ - Check: toolId in configurable.toolIds?                            │
│ - If not: return policy_denied (existing behavior)                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Tool Runner — SECOND GATE (defense in depth)                         │
│ ────────────────────────────────────────────                         │
│ 1. Validate context: tenantId present? (deny if missing)            │
│ 2. Resolve max policy: PolicyResolverPort.resolvePolicy(tenantId)   │
│ 3. Check: toolId in resolvedPolicy.allowedTools?                    │
│ 4. Check effect: if effect in requireApprovalForEffects → interrupt │
│ 5. Check idempotency: side-effect? check tool_execution_results     │
│ 6. Execute tool                                                      │
│ 7. Store idempotency result (if side-effect)                        │
│ 8. Emit receipt                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Defense in depth:**

- `configurable.toolIds` = route's requested subset (first gate, per GRAPH_EXECUTION.md #26)
- `PolicyResolverPort` = authoritative max allowlist (second gate, new)
- Route can restrict but not expand; both checks must pass

---

## Anti-Patterns

| Anti-Pattern                              | Why Forbidden                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Client-provided tenant/actor context      | Spoofable; resolved server-side from auth only                           |
| Wildcard tool allowlist for system        | Privilege escalation vector                                              |
| Unlimited budget for system               | No alerting, no kill switch                                              |
| `if (isSystemTenant) { allow privilege }` | is_system_tenant is metadata for defaults only; policy grants privilege  |
| Route-passed toolIds as ONLY authority    | Defense in depth: must also check PolicyResolverPort max allowlist       |
| Optional tenantId in ToolPolicyContext    | Silent bypass of billing/policy; must be required with test escape hatch |
| Side-effect tools without idempotency     | Retries cause duplicate posts/payments/actions                           |
| Fail at runtime if system tenant missing  | Startup healthcheck catches this early                                   |

---

## Related Documents

- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) — Billing accounts, owner vs actor
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing flow, invariants 26/29/30
- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — ExecutionGrant for scheduled runs
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool contracts, ToolEffect

---

**Last Updated**: 2026-01-20
**Status**: Draft — P0 fixes applied per security review
