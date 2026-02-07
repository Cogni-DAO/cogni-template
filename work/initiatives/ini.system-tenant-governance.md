---
work_item_id: ini.system-tenant-governance
work_item_type: initiative
title: System Tenant & Governance Execution Infrastructure
state: Active
priority: 1
estimate: 5
summary: Build system tenant infrastructure for governance AI loops with explicit tool policies, budget caps, and side-effect idempotency.
outcome: System tenant (`cogni_system`) can execute governance graphs through the same execution envelope as customers, with PolicyResolverPort enforcing authoritative allowlists and defense-in-depth validation.
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - system-tenant
  - governance
  - tool-policy
---

# System Tenant & Governance Execution Infrastructure

> Source: docs/SYSTEM_TENANT_DESIGN.md

## Goal

Enable the `cogni_system` billing account to execute governance AI loops as a first-class tenant through the unified `GraphExecutorPort`, with explicit tool allowlists (not wildcards), per-tool budgets and rate limits, side-effect idempotency, and defense-in-depth policy enforcement via `PolicyResolverPort`.

## Roadmap

### Crawl (P0): MVP — System Tenant Foundation

**Goal:** System tenant exists, PolicyResolverPort enforces authoritative allowlists, tenantId is required, side-effect tools are idempotent.

| Deliverable                                                                                | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------ | ----------- | --- | --------- |
| Schema & bootstrap: `is_system_tenant` column, `cogni_system` seed, startup healthcheck    | Not Started | 2   | —         |
| PolicyResolverPort: interface + DrizzlePolicyResolverAdapter with system/customer policies | Not Started | 3   | —         |
| ToolPolicyContext: required tenantId + test escape hatch                                   | Not Started | 2   | —         |
| Side-effect tool idempotency: `tool_execution_results` table + adapter check/store         | Not Started | 3   | —         |
| Chores: tenant_id/actor_type in traces, update ACCOUNTS_DESIGN.md                          | Not Started | 1   | —         |

#### Schema & Bootstrap

- [ ] Add `is_system_tenant` boolean column to `billing_accounts` (default false)
- [ ] Add migration that creates column AND inserts `cogni_system` (idempotent)
- [ ] Add startup healthcheck: fail if `cogni_system` missing
- [ ] Add to `pnpm dev:stack:test:setup`

#### PolicyResolverPort (single source of truth)

- [ ] Create `PolicyResolverPort` interface in `src/ports/`
- [ ] Implement `DrizzlePolicyResolverAdapter` — loads tenant, selects policy based on `is_system_tenant`
- [ ] System tenant policy: explicit allowlist (enumerate governance tools), high budget caps
- [ ] Customer tenant policy: default allowlist, standard budget, `requireApprovalForEffects: ['external_side_effect']`
- [ ] Update tool-runner to call `PolicyResolverPort.resolvePolicy()` — do NOT trust passed `toolIds`

#### ToolPolicyContext (required tenantId)

- [ ] Make `tenantId`, `actorType`, `actorId`, `toolCallId` required fields
- [ ] Add `createTestPolicyContext()` escape hatch for unit tests
- [ ] Update tool-runner to deny/throw if `tenantId` missing (defense in depth)
- [ ] Update providers to populate full context from `caller`

#### Side-effect tool idempotency

- [ ] Add `tool_execution_results` table: `(idempotency_key PK, result jsonb, created_at)`
- [ ] Idempotency key format: `${tenantId}/${runId}/${toolCallId}`
- [ ] Side-effect tool adapters check table before execute, store result after success
- [ ] On key match: return cached result, do not re-execute

#### Chores

- [ ] Add `tenant_id`, `actor_type` to traces/logs
- [ ] Documentation: update ACCOUNTS_DESIGN.md (done)

### Walk (P1): Enhanced Policy & Monitoring

**Goal:** Privileged action effects, spend alerting, kill switch, proper tenant membership.

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `privileged_action` to ToolEffect enum (payments, deployments)     | Not Started | 1   | —         |
| Spend alerting for system tenant (high watermark alerts)               | Not Started | 2   | —         |
| Kill switch for system tenant runs (manual + automatic on spend spike) | Not Started | 2   | —         |
| Tenant membership table for proper RLS (not owner_user_id based)       | Not Started | 3   | —         |

### Run (P2+): Governance Loops Live

**Goal:** Governance graphs execute under system tenant in production.

| Deliverable                                  | Status      | Est | Work Item |
| -------------------------------------------- | ----------- | --- | --------- |
| Create governance graphs under system tenant | Not Started | 5   | —         |

**Note:** Do NOT build preemptively. P2 starts when P0/P1 are stable.

## Constraints

- System tenant uses explicit tool allowlists, not `*` (no wildcard privilege)
- `is_system_tenant` is metadata only — NEVER an authorization branch (`if (isSystemTenant) { allow }`)
- PolicyResolverPort is authoritative; `configurable.toolIds` can restrict but not expand
- All side-effect tools MUST be idempotent (GitHub comments, broadcasts, payments)
- Tenant context (`billingAccountId`, actor) resolved server-side from auth — NEVER from client payloads

## Dependencies

- [ ] GRAPH_EXECUTION.md invariants 26/29/30 (configurable.toolIds enforcement, runId server authority)
- [ ] ACCOUNTS_DESIGN.md Owner vs Actor rules
- [ ] TOOL_USE_SPEC.md ToolEffect definitions

## As-Built Specs

- [System Tenant Design](../../docs/spec/system-tenant.md) — Core invariants, schema, policy resolution flow

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

## Design Notes

### Why `is_system_tenant` boolean (not `account_type` enum)?

| Approach                         | Pros                          | Cons                                      | Verdict        |
| -------------------------------- | ----------------------------- | ----------------------------------------- | -------------- |
| `is_system_tenant` boolean       | Simple, clear, boolean checks | Can't add org/team types later            | **Use for P0** |
| `account_type` enum              | Extensible                    | Over-engineering for P0, enum sprawl risk | Defer to P1    |
| Separate `system_accounts` table | Clean separation              | Fragments billing, duplicate schema       | Reject         |

**Rule:** Use boolean for P0. If we need org/team types later, we can add without breaking existing code.

**Guardrail:** `is_system_tenant` is ONLY used to select default policy. Never `if (isSystemTenant) { allow }`.

### Why PolicyResolverPort (defense in depth)?

Per GRAPH_EXECUTION.md #26, `configurable.toolIds` is the existing enforcement via `toLangChainTool`. Adding `PolicyResolverPort` provides defense in depth:

- Route bug could expand toolIds beyond tenant's actual allowlist
- Second gate catches this: PolicyResolverPort returns authoritative max
- Both checks must pass: tool in `configurable.toolIds` AND in resolved policy

**Rule:** `configurable.toolIds` can restrict (subset), but cannot expand beyond what `PolicyResolverPort.resolvePolicy(tenantId)` returns. First gate is existing behavior; second gate is new.

### Why required tenantId (not optional)?

Optional `tenantId` means production code could accidentally execute without tenant context:

- Bypasses billing attribution
- Bypasses policy enforcement
- Silent failure mode

**Rule:** `tenantId` is required. Tests use explicit `createTestPolicyContext()` that documents the bypass.

### Why side-effect tool idempotency?

Without idempotency:

- Graph retry = duplicate GitHub comment
- Stream replay = duplicate broadcast post
- Network timeout + retry = duplicate payment

**Rule:** Side-effect tools use `idempotencyKey = ${tenantId}/${runId}/${toolCallId}`. Adapter checks before execute, stores after success. Mirrors billing idempotency pattern.
