---
id: spec.tenant-connections
type: spec
title: Tenant Connections Design
status: draft
spec_state: draft
trust: draft
summary: Encrypted credential brokering for tools — connectionId-only references, AEAD storage, grant intersection, capability injection
read_when: Adding tool auth, implementing connection broker, or modifying grant scopes
implements: []
owner: cogni-dev
created: 2026-02-02
verified: null
tags:
  - auth
  - ai-graphs
---

# Tenant Connections Design

## Context

Graphs need access to external services (GitHub, Bluesky, Google) but must never carry credentials in state, args, or context. A Connection Broker resolves tokens at tool invocation time using encrypted, tenant-scoped connections authorized via ExecutionGrant scopes.

## Goal

Define the credential brokering invariants, encrypted storage schema, grant intersection rules, and capability-based auth injection that keep secrets out of graph state while providing tools with authenticated access.

## Non-Goals

- Payment verification (separate EvmRpcOnChainVerifier flow)
- MCP gateway integration (future — see [ini.tenant-connections](../../work/initiatives/ini.tenant-connections.md) P2)
- OAuth flow implementation (future — see initiative P1)

## Core Invariants

1. **CONNECTION_ID_ONLY**: Tools receive `connectionId` (opaque reference), never raw tokens. No secrets in `configurable`, `ToolPolicyContext`, or graph state.

2. **BROKER_AT_INVOCATION**: Token resolution happens inside `toolRunner.exec()`, not at graph construction or request ingress. Broker is injected into toolRunner; tool implementations must not call broker/vault directly.

3. **TENANT_SCOPED**: Connections belong to `billing_account_id`. Cross-tenant access forbidden. ExecutionGrants include `connection:use:{connectionId}` scopes.

4. **ENCRYPTED_AT_REST**: Credentials stored encrypted with AEAD. AAD binding: `{billing_account_id, connection_id, provider}` prevents ciphertext rebind across tenants. Key from env, not DB. Versioned key IDs for rotation.

5. **GRANT_AUTHORIZES_CONNECTION**: Request-provided `connectionIds` is a declaration, not authorization. Authorization comes from ExecutionGrant scopes only. Effective allowlist = `grant.allowedConnectionIds ∩ request.connectionIds`. Enforce membership before `broker.resolve()` (deny fast).

6. **SINGLE_AUTH_PATH**: Same credential resolution for all tools regardless of source (`@cogni/ai-tools` or MCP). No forked logic.

7. **REFRESH_WITH_TIMEOUT**: Background refresh preferred (jittered window before expiry). Synchronous refresh allowed with bounded timeout. On timeout/failure: typed error, metric emitted, tool invocation fails.

8. **CONNECTION_IN_CONTEXT_NOT_ARGS**: Authenticated tool invocations specify `connectionId` via `ToolInvocationContext` (out-of-band), NOT in tool args. This keeps tool input schemas pure business args, reduces injection surface, and prevents schema pollution. `connectionId` is uuid-validated at toolRunner boundary. See also [tool-use.md](./tool-use.md) (CONNECTION_ID_VIA_CONTEXT) for schema rejection at derivation time.

9. **AUTH_VIA_CAPABILITY_NOT_CONTEXT**: Broker outputs (access tokens, API keys, headers) must NEVER be placed into `ToolInvocationContext`, `RunnableConfig`, or ALS context. Tools receive auth via injected capability interfaces. This prevents secret leakage into logs, traces, telemetry, and exception messages.

9a. **AUTH_CAPABILITY_INVOCATION_SCOPED**: `AuthCapability` is constructed inside `toolRunner.exec()` per invocation, bound to `ctx.connectionId`. Methods take NO connectionId parameter. Never cache or reuse across invocations. See [tool-use.md](./tool-use.md).

10. **GRANT_INTERSECTION_BEFORE_RESOLVE**: `toolRunner.exec()` computes `effectiveConnectionIds = grant.allowedConnectionIds ∩ request.connectionIds`. Membership check (`connectionId ∈ effectiveConnectionIds`) happens BEFORE `broker.resolveForTool()`. Empty intersection or missing connectionId = `policy_denied`. This prevents confused-deputy attacks where malicious UI declares connections the grant doesn't authorize.

## Schema

**Table:** `connections`

| Column                  | Type        | Notes                                                          |
| ----------------------- | ----------- | -------------------------------------------------------------- |
| `id`                    | uuid        | PK                                                             |
| `billing_account_id`    | text        | FK, tenant scope                                               |
| `provider`              | text        | `github`, `bluesky`, `google`                                  |
| `credential_type`       | text        | `oauth2`, `app_password`, `api_key`, `github_app_installation` |
| `encrypted_credentials` | bytea       | AEAD encrypted JSON blob (includes nonce)                      |
| `encryption_key_id`     | text        | For key rotation                                               |
| `scopes`                | text[]      | OAuth scopes granted                                           |
| `expires_at`            | timestamptz | NULL if no expiry                                              |
| `created_at`            | timestamptz |                                                                |
| `created_by_user_id`    | text        | Audit: who created                                             |
| `last_used_at`          | timestamptz | Stale connection detection                                     |
| `revoked_at`            | timestamptz | Soft delete                                                    |
| `revoked_by_user_id`    | text        | Audit: who revoked                                             |

**Forbidden:** Plaintext `access_token`/`refresh_token` columns.

## Design

### Key Decisions

#### 1. Why Broker at Invocation?

Resolving at request time risks token expiry mid-run. Resolving at invocation keeps tokens fresh and enables transparent refresh without graph awareness.

#### 2. Connection Scoping

Connections are tenant-scoped, not tool-scoped. A GitHub connection serves any tool needing GitHub access. Request `connectionIds` declares intent; ExecutionGrant scopes authorize. Effective = intersection.

#### 3. Authorization Flow

1. Request declares `connectionIds[]` (intent) in `GraphRunRequest`
2. ExecutionGrant contains `connection:use:{id}` scopes (authorization)
3. toolRunner computes `effectiveConnectionIds = grant.allowedConnectionIds ∩ request.connectionIds`
4. Tool invocation specifies `connectionId` via `ToolInvocationContext` (out-of-band, not args)
5. Membership check (`connectionId ∈ effectiveConnectionIds`) BEFORE `broker.resolveForTool()` — deny fast
6. Broker verifies `connection.billing_account_id == subject.billingAccountId` (defense-in-depth)
7. Broker returns `ToolCredential`; toolRunner wraps in `AuthCapability` interface
8. Tool receives `capabilities.auth.getAccessToken()` — pre-bound to ctx.connectionId, no param

```
GraphRunRequest { connectionIds: ["conn-1", "conn-2"] }
                     │
                     ▼
ExecutionGrant { allowedConnectionIds: ["conn-1", "conn-3"] }
                     │
                     ▼
effectiveConnectionIds = ["conn-1"]  (intersection)
                     │
                     ▼
ToolInvocationContext { connectionId: "conn-1" }
                     │
                     ▼
toolRunner: assert("conn-1" ∈ effectiveConnectionIds) ✓
                     │
                     ▼
broker.resolveForTool("conn-1") → ToolCredential
                     │
                     ▼
capabilities.auth = BrokerBackedAuthCapability(credential)
                     │
                     ▼
boundTool.exec(args, ctx, { auth: capabilities.auth })
                     │
                     ▼
Tool calls: await capabilities.auth.getAccessToken()  // bound to ctx.connectionId
```

### Anti-Patterns

| Pattern                           | Problem                                            |
| --------------------------------- | -------------------------------------------------- |
| Tokens in `configurable`          | Serialized, logged, visible in traces              |
| Tokens in `ToolInvocationContext` | Leaked to logs, telemetry, exception messages      |
| connectionId in tool args         | Pollutes schemas, increases injection surface      |
| Different auth per tool source    | Fragments codebase, policy confusion               |
| Tools calling broker directly     | Bypasses grant enforcement, audit                  |
| Trust request connectionIds alone | Confused-deputy; must intersect w/ grant           |
| Implicit connectionId selection   | Authority leaks; must be explicit in context       |
| Resolve at construction           | Stale by execution time                            |
| ctxWithCreds pattern              | Violates NO_SECRETS_IN_CONTEXT; use capabilities   |
| Broker resolve before grant check | Leaks whether connection exists; check grant first |

### File Pointers

| File                                                 | Purpose                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `src/shared/db/schema.connections.ts`                | Connections table with audit columns                             |
| `src/ports/connection-broker.port.ts`                | `resolveForTool({connectionId, toolId, subject})` port interface |
| `src/adapters/server/connections/drizzle.adapter.ts` | AEAD decryption, AAD + tenant validation                         |
| `@cogni/ai-core/tooling/tool-runner.ts`              | Broker injection, grant intersection, capability injection       |
| `@cogni/ai-core/tooling/types.ts`                    | `ToolInvocationContext` with connectionId (no secrets)           |
| `@cogni/ai-tools/capabilities/auth.ts`               | `AuthCapability` interface for broker-backed auth                |

## Acceptance Checks

**Automated:**

- `connection-grant-intersection.test.ts` — grant intersection logic + deny-fast behavior
- `no-secrets-in-context.test.ts` — verify context types have no secret fields
- `capability-injection.test.ts` — tools receive capabilities, not raw secrets

**Manual:**

1. Verify `ToolInvocationContext` has no secret-shaped fields
2. Verify broker resolve is never called before grant intersection check

## Open Questions

_(none)_

## Related

- [tool-use.md](./tool-use.md) — CONNECTION_ID_ONLY invariant, CONNECTION_ID_VIA_CONTEXT
- [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md) — No secrets in configurable
- [scheduler.md](./scheduler.md) — ExecutionGrant scopes
- [Initiative: Tenant Connections](../../work/initiatives/ini.tenant-connections.md)
