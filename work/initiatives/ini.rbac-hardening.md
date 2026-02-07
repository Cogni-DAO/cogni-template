---
work_item_id: ini.rbac-hardening
work_item_type: initiative
title: RBAC Hardening — OpenFGA Authorization Implementation
state: Active
priority: 1
estimate: 4
summary: Implement OpenFGA-based authorization with actor/subject model, tool gating, and delegation management
outcome: All protected actions gated by AuthorizationPort.check() with dual-check for delegated execution
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [authorization, rbac]
---

# RBAC Hardening — OpenFGA Authorization Implementation

> Source: docs/RBAC_SPEC.md (roadmap content extracted during docs migration)

## Goal

Implement the OpenFGA-based authorization system designed in the RBAC spec: AuthorizationPort with actor/subject dual-check, tool execution gating, connection broker gating, and audit events.

## Roadmap

### Crawl (P0) — RBAC Spine

**Goal:** Wire AuthorizationPort, OpenFGA adapter, context identity fields, subject binding, and enforcement points.

| Deliverable                                                                                | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------ | ----------- | --- | --------- |
| `AuthorizationPort` interface with dual-check logic                                        | Not Started | 2   | —         |
| `OpenFgaAuthorizationAdapter` with retry + timeout                                         | Not Started | 2   | —         |
| `FakeAuthorizationAdapter` for tests                                                       | Not Started | 1   | —         |
| Context identity fields (actorId, subjectId?, tenantId, graphId)                           | Not Started | 1   | —         |
| Subject binding enforcement (server-side only)                                             | Not Started | 1   | —         |
| Wire into `toolRunner.exec()` (check before execution)                                     | Not Started | 2   | —         |
| Wire into `ConnectionBroker.resolveForTool()` (check before token)                         | Not Started | 2   | —         |
| Pass actor + subject through entire call chain                                             | Not Started | 2   | —         |
| Arch tests: authz-required-at-tool-exec, authz-required-at-broker, subject-binding-trusted | Not Started | 2   | —         |
| Composition root wiring (container.ts)                                                     | Not Started | 1   | —         |
| Observability + documentation chores                                                       | Not Started | 1   | —         |

**AuthorizationPort Interface:**

```typescript
interface AuthorizationPort {
  check(params: AuthzCheckParams): Promise<AuthzDecision>;
}
interface AuthzCheckParams {
  actor: string; // "user:{wallet}" | "agent:{id}" | "service:{name}"
  subject?: string; // "user:{wallet}" — only for OBO execution
  action: AuthzAction; // "tool.execute" | "connection.use" | "graph.invoke"
  resource: string; // "tool:{id}" | "connection:{id}" | "graph:{id}"
  context: AuthzContext; // { tenantId, graphId?, runId? }
}
type AuthzDecision = "allow" | "deny";
```

**Context Identity Fields (`@cogni/ai-core/tooling/types.ts`):**

- [ ] Add `actorId: string` to `ToolInvocationContext`
- [ ] Add `subjectId?: string` to `ToolInvocationContext` (OBO only)
- [ ] Add `tenantId: string` to `ToolInvocationContext`
- [ ] Add `graphId?: string` to `ToolInvocationContext`
- [ ] Update `GraphRunConfig` to include actor + optional subject

**Subject Binding (per OBO_SUBJECT_MUST_BE_BOUND):**

- [ ] `subjectId` set ONLY at session/grant issuance (server-side)
- [ ] `ToolInvocationContext.subjectId` is readonly, not from request body
- [ ] Arch test: grep for `subjectId` assignment outside trusted boundaries

**Env Vars:**

- [ ] Add `OPENFGA_API_URL`, `OPENFGA_STORE_ID` to env validation
- [ ] Configure OpenFGA store per environment (single store per env)

**File Pointers (P0 Scope):**

| File                                           | Change                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| `src/ports/authorization.port.ts`              | New: `AuthorizationPort` with actor+subject     |
| `src/ports/index.ts`                           | Add authorization port export                   |
| `src/adapters/server/authz/openfga.adapter.ts` | New: OpenFGA impl with dual-check               |
| `src/adapters/test/authz/fake.adapter.ts`      | New: Test fake                                  |
| `src/bootstrap/container.ts`                   | Wire authorization port                         |
| `@cogni/ai-core/tooling/types.ts`              | Add actorId, subjectId?, tenantId, graphId      |
| `@cogni/ai-core/tooling/tool-runner.ts`        | Inject AuthorizationPort, pass actor+subject    |
| `src/shared/env/server.ts`                     | Add OPENFGA_API_URL, OPENFGA_STORE_ID           |
| `tests/arch/authz-enforcement.test.ts`         | New: grep tests for bypass patterns             |
| `tests/arch/subject-binding.test.ts`           | New: verify subjectId only from trusted sources |

### Walk (P1) — Graph Invoke + Audit + Caching

**Goal:** Extend authorization to graph invocation, add audit events, caching.

| Deliverable                                                                      | Status      | Est | Work Item            |
| -------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Add `graph.invoke` check at `GraphExecutorPort.runGraph()` entry                 | Not Started | 2   | (create at P1 start) |
| Emit `authz.check` audit events with actor + subject                             | Not Started | 2   | (create at P1 start) |
| Add caching layer (LRU, 5s TTL, keyed by actor:subject:action:resource)          | Not Started | 2   | (create at P1 start) |
| Add batch check API for tool catalog filtering                                   | Not Started | 2   | (create at P1 start) |
| Implement scoped delegation via `delegation` type with `{tenant, graph}` binding | Not Started | 3   | (create at P1 start) |

### Run (P2+) — Delegation Management

**Goal:** User-facing delegation management with scoped, time-bounded delegations.

| Deliverable                                                    | Status      | Est | Work Item            |
| -------------------------------------------------------------- | ----------- | --- | -------------------- |
| UI for managing agent delegations                              | Not Started | 3   | (create at P2 start) |
| Delegation scopes (limit what agents can do on behalf of user) | Not Started | 2   | (create at P2 start) |
| Time-bounded delegations                                       | Not Started | 2   | (create at P2 start) |

**Condition:** Need agent management UI first.

## Constraints

- DENY_BY_DEFAULT: If no explicit relation exists in OpenFGA, check returns DENY
- OBO_SUBJECT_MUST_BE_BOUND: subjectId cannot be supplied by agents, tools, or request parameters
- AUTHZ_FAIL_CLOSED_WITH_DISTINCTION: deny on infrastructure failure, distinct error codes
- ToolPolicy and Grant Intersection are capability/safety gates that execute before OpenFGA (fail-fast)

## Dependencies

- [ ] OpenFGA deployment (Docker service)
- [x] ToolPolicy design (TOOL_USE_SPEC.md)
- [x] ConnectionBroker design (TENANT_CONNECTIONS_SPEC.md)

## As-Built Specs

- [RBAC Spec](../../docs/spec/rbac.md) — Core invariants, actor model, OpenFGA schema, design decisions

## Design Notes

**P0 Known Limitation — Global Delegation:**

The current `user.delegates` relation is global—not scoped to tenant or graph. An agent with delegation can act on behalf of the user across all resources the user can access.

**P0 Mitigations:**

1. Only first-party agents (graphs defined in this repository) may receive delegation
2. MCP-discovered agents MUST NOT receive delegation (per MCP_UNTRUSTED_BY_DEFAULT)
3. Delegation issuance requires explicit user action in UI

**P1 Scope:** Implement scoped delegation via `delegation` type with `{tenant, graph}` binding.

**Chores (P0):**

- [ ] Observability [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation [document.md](../.agent/workflows/document.md)
