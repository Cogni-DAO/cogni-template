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

---

## What Already Exists

The codebase already has the primitives needed:

| Primitive                | Location                                        | Status                                                        |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------- |
| `caller: LlmCaller`      | `GraphRunRequest`                               | ✅ Has `billingAccountId`, `virtualKeyId`                     |
| `ToolPolicy`             | `@cogni/ai-core/tooling/runtime/tool-policy.ts` | ✅ Has `allowedTools`, `requireApprovalForEffects`, `budgets` |
| `ToolEffect`             | `@cogni/ai-core/tooling/types.ts`               | ✅ Has `read_only`, `state_change`, `external_side_effect`    |
| `ToolPolicyContext`      | `@cogni/ai-core/tooling/runtime/tool-policy.ts` | ✅ Has `runId`, notes P1 expansion                            |
| `ExecutionGrant`         | `src/types/scheduling.ts`                       | ✅ Has `billingAccountId`, `scopes`, `userId`                 |
| `RUNID_SERVER_AUTHORITY` | GRAPH_EXECUTION.md #29                          | ✅ Client runId ignored                                       |

**What's missing:**

| Gap                               | Fix                                         |
| --------------------------------- | ------------------------------------------- |
| No `is_system_tenant` flag        | Add column to `billing_accounts`            |
| No `cogni_system` record          | Add seed/migration                          |
| No tenant-based policy resolution | Extend `ToolPolicyContext` with tenant info |
| No spend alerting for system      | Add monitoring (P1)                         |

---

## Schema

### billing_accounts (extension)

**New column:**

| Column             | Type    | Notes                   |
| ------------------ | ------- | ----------------------- |
| `is_system_tenant` | boolean | NOT NULL, default false |

**Constraint:** Check constraint or RLS — `is_system_tenant=true` accounts have different access patterns (no `owner_user_id` required).

**System tenant bootstrap:**

```sql
INSERT INTO billing_accounts (id, owner_user_id, is_system_tenant, balance_credits, created_at, updated_at)
VALUES ('cogni_system', NULL, true, 0, now(), now())
ON CONFLICT (id) DO NOTHING;
```

### ToolPolicyContext (extension)

Extend existing `ToolPolicyContext` (don't create new abstraction):

```typescript
// @cogni/ai-core/tooling/runtime/tool-policy.ts — extend existing interface
export interface ToolPolicyContext {
  readonly runId: string;
  // P1 additions for tenant-aware policy:
  readonly tenantId?: string; // billing_account_id
  readonly isSystemTenant?: boolean; // for policy selection
  readonly actorType?: "user" | "system" | "webhook";
  readonly actorId?: string;
}
```

---

## Implementation Checklist

### P0: MVP — System Tenant Foundation

**Schema:**

- [ ] Add `is_system_tenant` boolean column to `billing_accounts` (default false)
- [ ] Add migration
- [ ] Add seed script: create `cogni_system` billing account with `is_system_tenant=true`
- [ ] Add to `pnpm dev:stack:test:setup`

**Policy resolution:**

- [ ] Create `resolveTenantPolicy(billingAccountId): ToolPolicy` helper
- [ ] System tenant policy: explicit allowlist (enumerate governance tools), high budget caps
- [ ] Customer tenant policy: default allowlist, standard budget, `requireApprovalForEffects: ['external_side_effect']`

**Extend ToolPolicyContext:**

- [ ] Add optional `tenantId`, `isSystemTenant`, `actorType`, `actorId` fields
- [ ] Update `tool-runner.ts` to pass extended context
- [ ] Providers populate context from `caller` (already has billingAccountId)

#### Chores

- [ ] Add `tenant_id`, `is_system_tenant`, `actor_type` to traces/logs
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

| File                                                          | Change                                |
| ------------------------------------------------------------- | ------------------------------------- |
| `src/shared/db/schema.billing.ts`                             | Add `is_system_tenant` column         |
| `src/adapters/server/db/migrations/XXXX_add_system_tenant.ts` | New migration                         |
| `scripts/seed-system-tenant.ts`                               | New: bootstrap `cogni_system` account |
| `packages/ai-core/src/tooling/runtime/tool-policy.ts`         | Extend `ToolPolicyContext`            |
| `src/features/ai/services/tenant-policy.ts`                   | New: `resolveTenantPolicy()`          |
| `packages/ai-core/src/tooling/tool-runner.ts`                 | Pass extended context                 |

---

## Design Decisions

### 1. Why `is_system_tenant` boolean (not `account_type` enum)?

| Approach                         | Pros                          | Cons                                      | Verdict        |
| -------------------------------- | ----------------------------- | ----------------------------------------- | -------------- |
| `is_system_tenant` boolean       | Simple, clear, boolean checks | Can't add org/team types later            | **Use for P0** |
| `account_type` enum              | Extensible                    | Over-engineering for P0, enum sprawl risk | Defer to P1    |
| Separate `system_accounts` table | Clean separation              | Fragments billing, duplicate schema       | Reject         |

**Rule:** Use boolean for P0. If we need org/team types later, we can add without breaking existing code.

### 2. Why explicit allowlist (not wildcard)?

Wildcard `*` for system tools creates a privilege escalation vector:

- If a tool has a bug allowing arbitrary action, system tenant can exploit it
- If tool injection becomes possible, system tenant amplifies the attack
- No audit trail of "what tools does system actually use"

**Rule:** System tenant enumerates its tools: `['broadcast_cogni', 'cred_payout', 'git_review_comment', ...]`

### 3. Why high caps (not unlimited)?

Unlimited budget for system tenant means:

- Runaway loop = unbounded spend
- No alerting threshold to catch bugs
- No kill switch trigger

**Rule:** System tenant has `budgetCredits: 100_000_000_000` (10K USD equivalent) with:

- Alert at 50% spend
- Kill switch at 90%
- Per-tool rate limits (e.g., max 100 calls/hour for expensive tools)

### 4. Policy Resolution Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Route/Facade (server-side)                                          │
│ ────────────────────────────                                        │
│ 1. Authenticate: session → userId, API key → billingAccountId, etc │
│ 2. Load billing account: is_system_tenant?                          │
│ 3. Resolve policy: resolveTenantPolicy(billingAccountId)            │
│ 4. Build caller: { billingAccountId, virtualKeyId }                 │
│ 5. Call graphExecutor.runGraph({ ..., caller, toolIds: policy.allowedTools })
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Tool Runner (at execution time)                                      │
│ ─────────────────────────────                                        │
│ 1. Receive extended context: { runId, tenantId, isSystemTenant, ...}│
│ 2. Check allowlist: toolId in policy.allowedTools?                  │
│ 3. Check effect: if effect in requireApprovalForEffects → interrupt │
│ 4. Execute + emit receipt                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Key:** Tenant context is resolved from auth at ingress. Client never provides it.

---

## Anti-Patterns

| Anti-Pattern                         | Why Forbidden                                                             |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Client-provided tenant/actor context | Spoofable; resolved server-side from auth only                            |
| Wildcard tool allowlist for system   | Privilege escalation vector                                               |
| Unlimited budget for system          | No alerting, no kill switch                                               |
| Boolean `requireHilForSideEffects`   | Use `ToolEffect` levels with `requireApprovalForEffects` array            |
| RLS based on `owner_user_id`         | System tenant has NULL owner; use tenant membership (P1)                  |
| New `RunContext` abstraction         | Extends existing `ToolPolicyContext`; billing context already in `caller` |

---

## Related Documents

- [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md) — Billing accounts, owner vs actor
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing flow, invariants 26/29/30
- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — ExecutionGrant for scheduled runs
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool contracts, ToolEffect

---

**Last Updated**: 2026-01-20
**Status**: Draft — Revised per security review
