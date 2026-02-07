---
id: spec.system-tenant
type: spec
title: System Tenant & Governance Execution Design
status: draft
spec_state: draft
trust: draft
summary: System tenant (`cogni_system`) executes governance AI loops as a first-class tenant with server-resolved context, explicit tool allowlists, budget caps, and defense-in-depth policy enforcement.
read_when: Implementing governance loops, tool policy enforcement, or system-initiated AI execution
implements: []
owner: cogni-dev
created: 2026-01-20
verified: null
tags:
  - system-tenant
  - governance
  - tool-policy
  - security
---

# System Tenant & Governance Execution Design

## Context

Cogni needs to execute governance AI loops (e.g., automated code review, policy enforcement, DAO proposal analysis) under a system-controlled billing account. Without a system tenant, governance automation would either:

- Execute under arbitrary customer tenants (privilege confusion)
- Bypass billing/policy systems entirely (audit gap)
- Require special-case execution paths (maintenance burden)

This spec defines `cogni_system` as a **first-class tenant** using the same `GraphExecutorPort` execution envelope as customers, with explicit tool allowlists (not wildcards), per-tool budgets, and defense-in-depth policy enforcement.

## Goal

Enable system-initiated AI execution with:

- System tenant (`cogni_system`) as a first-class billing account with `is_system_tenant=true`
- Server-side tenant/actor context resolution from auth (never from client payloads)
- Explicit tool allowlists (no `*` wildcards) to prevent privilege escalation
- Budget caps and rate limits (high but not unlimited) to prevent runaway loops
- Side-effect tool idempotency to prevent duplicate actions on retries
- Defense-in-depth policy enforcement via `PolicyResolverPort` (authoritative allowlist) + `configurable.toolIds` (runtime restriction)

## Non-Goals

- **Not in scope:** Multi-org tenants or team-based billing (P1 consideration)
- **Not in scope:** DAO wallet as tenant owner (P1: add `tenant_settings` table for DAO address storage)
- **Not in scope:** Building governance graphs preemptively (P2: create when infrastructure is stable)
- **Not in scope:** Unlimited budgets or wildcard tool allowlists for system tenant

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

## Schema

### billing_accounts (extension)

**New column:**

| Column             | Type    | Notes                   |
| ------------------ | ------- | ----------------------- |
| `is_system_tenant` | boolean | NOT NULL, default false |

**Constraint:** `is_system_tenant` is metadata only — no RLS or authorization logic branches on this field.

**System tenant bootstrap (idempotent):**

```sql
-- 1. Seed service principal user (app-level owner, NOT the DAO governance address)
INSERT INTO users (id, wallet_address)
VALUES ('cogni_system_principal', NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. Seed system tenant owned by service principal
INSERT INTO billing_accounts (id, owner_user_id, is_system_tenant, balance_credits, created_at)
VALUES ('cogni_system', 'cogni_system_principal', true, 0, now())
ON CONFLICT (id) DO NOTHING;
```

**Why service principal (not DAO address)?**

- Keeps `owner_user_id` NOT NULL (no constraint changes)
- Separates app principal ownership from governance authority
- Avoids filesystem-dependent migrations (no repo-spec.yaml reads)
- P1: Add `tenant_settings` table to store DAO address + policy defaults

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

## Design

### As-Built State

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

### Key Decisions

#### 1. Why `is_system_tenant` boolean (not `account_type` enum)?

| Approach                         | Pros                          | Cons                                      | Verdict        |
| -------------------------------- | ----------------------------- | ----------------------------------------- | -------------- |
| `is_system_tenant` boolean       | Simple, clear, boolean checks | Can't add org/team types later            | **Use for P0** |
| `account_type` enum              | Extensible                    | Over-engineering for P0, enum sprawl risk | Defer to P1    |
| Separate `system_accounts` table | Clean separation              | Fragments billing, duplicate schema       | Reject         |

**Rule:** Use boolean for P0. If we need org/team types later, we can add without breaking existing code.

**Guardrail:** `is_system_tenant` is ONLY used to select default policy. Never `if (isSystemTenant) { allow }`.

#### 2. Why PolicyResolverPort (defense in depth)?

Per GRAPH_EXECUTION.md #26, `configurable.toolIds` is the existing enforcement via `toLangChainTool`. Adding `PolicyResolverPort` provides defense in depth:

- Route bug could expand toolIds beyond tenant's actual allowlist
- Second gate catches this: PolicyResolverPort returns authoritative max
- Both checks must pass: tool in `configurable.toolIds` AND in resolved policy

**Rule:** `configurable.toolIds` can restrict (subset), but cannot expand beyond what `PolicyResolverPort.resolvePolicy(tenantId)` returns. First gate is existing behavior; second gate is new.

#### 3. Why required tenantId (not optional)?

Optional `tenantId` means production code could accidentally execute without tenant context:

- Bypasses billing attribution
- Bypasses policy enforcement
- Silent failure mode

**Rule:** `tenantId` is required. Tests use explicit `createTestPolicyContext()` that documents the bypass.

#### 4. Why side-effect tool idempotency?

Without idempotency:

- Graph retry = duplicate GitHub comment
- Stream replay = duplicate broadcast post
- Network timeout + retry = duplicate payment

**Rule:** Side-effect tools use `idempotencyKey = ${tenantId}/${runId}/${toolCallId}`. Adapter checks before execute, stores after success. Mirrors billing idempotency pattern.

### Policy Resolution Flow (Defense in Depth)

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

## Acceptance Checks

**Automated:**

- `pnpm test packages/ai-core/src/tooling/runtime/tool-policy.test.ts` — ToolPolicyContext validation
- `pnpm test src/adapters/server/policy/drizzle-policy-resolver.test.ts` — PolicyResolverPort implementation
- `pnpm test src/adapters/server/ai/tool-idempotency.test.ts` — Side-effect idempotency adapter

**Manual (until automated):**

1. Verify `cogni_system` billing account exists: `SELECT * FROM billing_accounts WHERE id = 'cogni_system';`
2. Verify startup healthcheck fails if system tenant missing (delete record, restart app, should fail fast)
3. Verify tool execution denied if `tenantId` missing from context
4. Verify PolicyResolverPort returns authoritative max allowlist for system/customer tenants
5. Verify side-effect tools dedupe on retry (check `tool_execution_results` table)

## Open Questions

- [ ] Should `privileged_action` ToolEffect level be added in P0 or deferred to P1?
- [ ] What should the initial system tenant tool allowlist include? (enumerate governance tools)
- [ ] Should tenant membership table (P1) use separate junction table or extend `billing_accounts`?

## Rollout / Migration

1. Run migration to add `is_system_tenant` column + seed `cogni_system` record
2. Add startup healthcheck to `src/bootstrap/healthchecks.ts`
3. Implement `PolicyResolverPort` + `DrizzlePolicyResolverAdapter`
4. Update tool-runner to require `tenantId` in `ToolPolicyContext` (breaking change — update all callers)
5. Add `tool_execution_results` table + idempotency adapter
6. Update side-effect tools to use idempotency key

**Breaking changes:**

- `ToolPolicyContext.tenantId` becomes required (existing tests must use `createTestPolicyContext()`)
- Tool-runner denies execution if `tenantId` missing (no silent fallback)

## Related

- [Accounts Design](../ACCOUNTS_DESIGN.md) — Billing accounts, owner vs actor (pending migration)
- [Graph Execution](../GRAPH_EXECUTION.md) — GraphExecutorPort, billing flow, invariants 26/29/30 (pending migration)
- [Scheduler](./scheduler.md) — ExecutionGrant for scheduled runs
- [Tool Use](../TOOL_USE_SPEC.md) — Tool contracts, ToolEffect (pending migration)
- [System Tenant Initiative](../../work/initiatives/ini.system-tenant-governance.md) — Implementation roadmap
