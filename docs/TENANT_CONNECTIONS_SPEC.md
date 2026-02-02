# Tenant Connections Design

> [!CRITICAL]
> Graphs carry `connectionId` only, never credentials. Connection Broker resolves tokens at tool invocation time.

## Core Invariants

1. **CONNECTION_ID_ONLY**: Tools receive `connectionId` (opaque reference), never raw tokens. No secrets in `configurable`, `ToolPolicyContext`, or graph state.

2. **BROKER_AT_INVOCATION**: Token resolution happens inside `toolRunner.exec()`, not at graph construction or request ingress. Broker is injected into toolRunner; tool implementations must not call broker/vault directly.

3. **TENANT_SCOPED**: Connections belong to `billing_account_id`. Cross-tenant access forbidden. ExecutionGrants include `connection:use:{connectionId}` scopes.

4. **ENCRYPTED_AT_REST**: Credentials stored encrypted with AEAD. AAD binding: `{billing_account_id, connection_id, provider}` prevents ciphertext rebind across tenants. Key from env, not DB. Versioned key IDs for rotation.

5. **GRANT_AUTHORIZES_CONNECTION**: Request-provided `connectionIds` is a declaration, not authorization. Authorization comes from ExecutionGrant scopes only. Effective allowlist = `grant.allowedConnectionIds ∩ request.connectionIds`. Enforce membership before `broker.resolve()` (deny fast).

6. **SINGLE_AUTH_PATH**: Same credential resolution for all tools regardless of source (`@cogni/ai-tools` or MCP). No forked logic.

7. **REFRESH_WITH_TIMEOUT**: Background refresh preferred (jittered window before expiry). Synchronous refresh allowed with bounded timeout. On timeout/failure: typed error, metric emitted, tool invocation fails.

8. **CONNECTION_IN_CONTEXT_NOT_ARGS**: Authenticated tool invocations specify `connectionId` via `ToolInvocationContext` (out-of-band), NOT in tool args. This keeps tool input schemas pure business args, reduces injection surface, and prevents schema pollution. `connectionId` is uuid-validated at toolRunner boundary. See also [TOOL_USE_SPEC.md#26a](TOOL_USE_SPEC.md) (CONNECTION_ID_VIA_CONTEXT) for schema rejection at derivation time.

9. **AUTH_VIA_CAPABILITY_NOT_CONTEXT**: Broker outputs (access tokens, API keys, headers) must NEVER be placed into `ToolInvocationContext`, `RunnableConfig`, or ALS context. Tools receive auth via injected capability interfaces. This prevents secret leakage into logs, traces, telemetry, and exception messages.

9a. **AUTH_CAPABILITY_INVOCATION_SCOPED**: `AuthCapability` is constructed inside `toolRunner.exec()` per invocation, bound to `ctx.connectionId`. Methods take NO connectionId parameter. Never cache or reuse across invocations. See [TOOL_USE_SPEC.md#29a](TOOL_USE_SPEC.md).

10. **GRANT_INTERSECTION_BEFORE_RESOLVE**: `toolRunner.exec()` computes `effectiveConnectionIds = grant.allowedConnectionIds ∩ request.connectionIds`. Membership check (`connectionId ∈ effectiveConnectionIds`) happens BEFORE `broker.resolveForTool()`. Empty intersection or missing connectionId = `policy_denied`. This prevents confused-deputy attacks where malicious UI declares connections the grant doesn't authorize.

---

## Schema: `connections`

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

---

## Implementation Checklist

### P0: Connection Model

- [ ] Create `connections` table with AEAD encrypted storage
- [ ] Create `ConnectionBrokerPort`: `resolveForTool({connectionId, toolId, subject}) → ToolCredential`
- [ ] Implement `DrizzleConnectionBrokerAdapter` with decryption + AAD validation
- [ ] Wire broker into `toolRunner.exec()` (injected, not called by tools)
- [ ] Enforce grant intersection before resolve (deny fast)
- [ ] First type: `app_password` (Bluesky) — no OAuth

**Port contract:**

- `subject: {billingAccountId, grantId, runId}` — broker verifies tenant match, logs audit
- `ToolCredential: {provider, secret: string | {headers}, expiresAt?}` — broker validates `connection.provider` matches tool expectation

### P0: Grant Intersection + Capability Auth

Per invariants **CONNECTION_IN_CONTEXT_NOT_ARGS**, **AUTH_VIA_CAPABILITY_NOT_CONTEXT**, **GRANT_INTERSECTION_BEFORE_RESOLVE**:

**Context types (`@cogni/ai-core/tooling/`):**

- [ ] Add `connectionId?: string` to `ToolInvocationContext` (out-of-band, not in args)
- [ ] Add `executionGrant?: ExecutionGrantContext` to toolRunner config
- [ ] `ExecutionGrantContext: { grantId: string, allowedConnectionIds: string[] }`
- [ ] Validate: `ToolInvocationContext` has NO secret-shaped fields (test)

**Grant intersection (`@cogni/ai-core/tooling/tool-runner.ts`):**

- [ ] Implement `computeEffectiveConnectionIds(grant, request)`:
  ```typescript
  const effective = grant.allowedConnectionIds.filter((id) =>
    request.connectionIds.includes(id)
  );
  ```
- [ ] Check `connectionId ∈ effective` BEFORE any broker call
- [ ] Return `{ ok: false, errorCode: 'policy_denied', safeMessage: 'Connection not authorized' }` on failure
- [ ] Log audit event: `tool.connection.denied` with `{ toolId, connectionId, grantId }`

**Capability interfaces (`@cogni/ai-tools/capabilities/`):**

- [ ] Create `AuthCapability` interface (invocation-scoped, no connectionId param):
  ```typescript
  /** Pre-bound to ctx.connectionId — no param needed (per AUTH_CAPABILITY_INVOCATION_SCOPED) */
  interface AuthCapability {
    getAccessToken(): Promise<string>;
    getAuthHeaders(): Promise<Record<string, string>>;
  }
  ```
- [ ] Create `ConnectionClientFactory` interface for typed clients
- [ ] Tool contracts declare: `capabilities: ['auth'] as const`
- [ ] Composition root creates broker-backed `AuthCapability` implementation
- [ ] toolRunner injects capabilities into `boundTool.exec(args, ctx, { auth })`

**Tests:**

- [ ] `connection-grant-intersection.test.ts` — unit test for intersection logic
- [ ] `no-secrets-in-context.test.ts` — verify context types have no secret fields
- [ ] `capability-injection.test.ts` — tools receive capabilities, not raw secrets

#### Chores

- [ ] Observability [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation [document.md](../.agent/workflows/document.md)

### P1: OAuth Flow

- [ ] OAuth callback endpoint (authorization code flow)
- [ ] Background token refresh (before expiry)
- [ ] First OAuth provider: GitHub or Google
- [ ] UI: connection list, create, revoke

### P2: MCP Gateway

- [ ] MCP adapter uses same `connectionId` → broker path
- [ ] Evaluate: `agentgateway`, `mcp-gateway-registry`
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0)

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

---

## Design Decisions

### 1. Why Broker at Invocation?

Resolving at request time risks token expiry mid-run. Resolving at invocation keeps tokens fresh and enables transparent refresh without graph awareness.

### 2. Connection Scoping

Connections are tenant-scoped, not tool-scoped. A GitHub connection serves any tool needing GitHub access. Request `connectionIds` declares intent; ExecutionGrant scopes authorize. Effective = intersection.

### 3. Authorization Flow

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

---

## Anti-Patterns

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

---

## Related Documents

- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md#26) — CONNECTION_ID_ONLY invariant
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md#30) — No secrets in configurable
- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — ExecutionGrant scopes

---

**Last Updated**: 2026-02-02
**Status**: Draft (Rev 5 - #9a per-invocation construction; canonical naming: effectiveConnectionIds, grant.allowedConnectionIds ∩ request.connectionIds)
