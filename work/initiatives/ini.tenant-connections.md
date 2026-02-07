---
work_item_id: ini.tenant-connections
work_item_type: initiative
title: Tenant Connections — Encrypted Credential Brokering
state: Paused
priority: 2
estimate: 5
summary: Implement connection broker with AEAD encrypted storage, grant intersection, capability-based auth injection, OAuth flows, and MCP gateway
outcome: Tools receive credentials via injected capabilities; no secrets in context/args/state; grant-scoped access enforcement
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - auth
  - ai-graphs
---

# Tenant Connections — Encrypted Credential Brokering

> Source: docs/TENANT_CONNECTIONS_SPEC.md

## Goal

Implement the connection broker system that provides tools with encrypted, tenant-scoped credentials via injected capability interfaces. Grant intersection enforces authorization before credential resolution. No secrets ever appear in context, args, or graph state.

## Roadmap

### Crawl (P0): Connection Model

**Goal:** AEAD encrypted storage, broker port, grant intersection, capability injection.

| Deliverable                                                                      | Status      | Est | Work Item |
| -------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `connections` table with AEAD encrypted storage                           | Not Started | 2   | —         |
| Create `ConnectionBrokerPort`: `resolveForTool({connectionId, toolId, subject})` | Not Started | 1   | —         |
| Implement `DrizzleConnectionBrokerAdapter` with decryption + AAD validation      | Not Started | 2   | —         |
| Wire broker into `toolRunner.exec()` (injected, not called by tools)             | Not Started | 1   | —         |
| Enforce grant intersection before resolve (deny fast)                            | Not Started | 1   | —         |
| First type: `app_password` (Bluesky) — no OAuth                                  | Not Started | 1   | —         |

**Port contract:**

- `subject: {billingAccountId, grantId, runId}` — broker verifies tenant match, logs audit
- `ToolCredential: {provider, secret: string | {headers}, expiresAt?}` — broker validates `connection.provider` matches tool expectation

### Crawl (P0): Grant Intersection + Capability Auth

**Goal:** Per invariants CONNECTION_IN_CONTEXT_NOT_ARGS, AUTH_VIA_CAPABILITY_NOT_CONTEXT, GRANT_INTERSECTION_BEFORE_RESOLVE.

**Context types (`@cogni/ai-core/tooling/`):**

| Deliverable                                                                       | Status      | Est | Work Item |
| --------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `connectionId?: string` to `ToolInvocationContext` (out-of-band, not in args) | Not Started | 1   | —         |
| Add `executionGrant?: ExecutionGrantContext` to toolRunner config                 | Not Started | 1   | —         |
| `ExecutionGrantContext: { grantId: string, allowedConnectionIds: string[] }`      | Not Started | 0   | —         |
| Validate: `ToolInvocationContext` has NO secret-shaped fields (test)              | Not Started | 1   | —         |

**Grant intersection (`@cogni/ai-core/tooling/tool-runner.ts`):**

| Deliverable                                                                                                                               | Status      | Est | Work Item |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Implement `computeEffectiveConnectionIds(grant, request)` — `grant.allowedConnectionIds.filter(id => request.connectionIds.includes(id))` | Not Started | 1   | —         |
| Check `connectionId ∈ effective` BEFORE any broker call                                                                                   | Not Started | 0   | —         |
| Return `{ ok: false, errorCode: 'policy_denied', safeMessage: 'Connection not authorized' }` on failure                                   | Not Started | 0   | —         |
| Log audit event: `tool.connection.denied` with `{ toolId, connectionId, grantId }`                                                        | Not Started | 0   | —         |

**Capability interfaces (`@cogni/ai-tools/capabilities/`):**

| Deliverable                                                                  | Status      | Est | Work Item |
| ---------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `AuthCapability` interface (invocation-scoped, no connectionId param) | Not Started | 1   | —         |
| Create `ConnectionClientFactory` interface for typed clients                 | Not Started | 1   | —         |
| Tool contracts declare: `capabilities: ['auth'] as const`                    | Not Started | 0   | —         |
| Composition root creates broker-backed `AuthCapability` implementation       | Not Started | 1   | —         |
| toolRunner injects capabilities into `boundTool.exec(args, ctx, { auth })`   | Not Started | 1   | —         |

**AuthCapability interface:**

```typescript
/** Pre-bound to ctx.connectionId — no param needed (per AUTH_CAPABILITY_INVOCATION_SCOPED) */
interface AuthCapability {
  getAccessToken(): Promise<string>;
  getAuthHeaders(): Promise<Record<string, string>>;
}
```

**Tests:**

| Deliverable                                                                  | Status      | Est | Work Item |
| ---------------------------------------------------------------------------- | ----------- | --- | --------- |
| `connection-grant-intersection.test.ts` — unit test for intersection logic   | Not Started | 1   | —         |
| `no-secrets-in-context.test.ts` — verify context types have no secret fields | Not Started | 1   | —         |
| `capability-injection.test.ts` — tools receive capabilities, not raw secrets | Not Started | 1   | —         |

**Chores:**

| Deliverable   | Status      | Est | Work Item |
| ------------- | ----------- | --- | --------- |
| Observability | Not Started | 1   | —         |
| Documentation | Not Started | 1   | —         |

#### File Pointers (P0)

| File                                                  | Change                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| `src/shared/db/schema.connections.ts`                 | New table with audit columns                                     |
| `src/ports/connection-broker.port.ts`                 | `resolveForTool({connectionId, toolId, subject})` port interface |
| `src/adapters/server/connections/drizzle.adapter.ts`  | AEAD decryption, AAD + tenant validation                         |
| `@cogni/ai-core/tooling/tool-runner.ts`               | Inject broker, enforce grant intersection, inject capabilities   |
| `@cogni/ai-core/tooling/types.ts`                     | `ToolInvocationContext` with connectionId (no secrets)           |
| `@cogni/ai-core/configurable/graph-run-config.ts`     | Add `allowedConnectionIds`, `executionGrant` fields              |
| `@cogni/ai-tools/capabilities/auth.ts`                | `AuthCapability` interface for broker-backed auth                |
| `tests/arch/no-secrets-in-context.test.ts`            | Static check for secret-shaped fields in context types           |
| `tests/unit/ai/connection-grant-intersection.test.ts` | Grant intersection logic + deny-fast behavior                    |

### Walk (P1): OAuth Flow

**Goal:** Full OAuth authorization code flow with background token refresh.

| Deliverable                                  | Status      | Est | Work Item |
| -------------------------------------------- | ----------- | --- | --------- |
| OAuth callback endpoint (authorization code) | Not Started | 2   | —         |
| Background token refresh (before expiry)     | Not Started | 2   | —         |
| First OAuth provider: GitHub or Google       | Not Started | 1   | —         |
| UI: connection list, create, revoke          | Not Started | 2   | —         |

### Run (P2): MCP Gateway

**Goal:** MCP adapter uses same connectionId → broker path.

| Deliverable                                        | Status      | Est | Work Item |
| -------------------------------------------------- | ----------- | --- | --------- |
| MCP adapter uses same `connectionId` → broker path | Not Started | 2   | —         |
| Evaluate: `agentgateway`, `mcp-gateway-registry`   | Not Started | 1   | —         |
| Do NOT build preemptively                          | Not Started | 0   | —         |

## Constraints

- **CONNECTION_ID_ONLY**: Tools receive `connectionId` (opaque reference), never raw tokens
- **BROKER_AT_INVOCATION**: Token resolution inside `toolRunner.exec()`, not at graph construction
- **ENCRYPTED_AT_REST**: AEAD encryption with AAD binding to prevent ciphertext rebind
- **SINGLE_AUTH_PATH**: Same credential resolution for all tools regardless of source

## Dependencies

- [ ] ExecutionGrant scopes (scheduler spec)
- [ ] ToolRunner infrastructure (@cogni/ai-core)
- [ ] AEAD encryption key provisioning (env-based)

## As-Built Specs

- [tenant-connections.md](../../docs/spec/tenant-connections.md) — Core invariants, schema, design decisions, anti-patterns

## Design Notes

_(none yet)_
