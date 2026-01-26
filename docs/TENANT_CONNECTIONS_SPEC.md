# Tenant Connections Design

> [!CRITICAL]
> Graphs carry `connectionId` only, never credentials. Connection Broker resolves tokens at tool invocation time.

## Core Invariants

1. **CONNECTION_ID_ONLY**: Tools receive `connectionId` (opaque reference), never raw tokens. No secrets in `configurable`, `ToolPolicyContext`, or graph state.

2. **BROKER_AT_INVOCATION**: Token resolution happens inside `toolRunner.exec()`, not at graph construction or request ingress. Broker is injected into toolRunner; tool implementations must not call broker/vault directly.

3. **TENANT_SCOPED**: Connections belong to `billing_account_id`. Cross-tenant access forbidden. ExecutionGrants include `connection:use:{connectionId}` scopes.

4. **ENCRYPTED_AT_REST**: Credentials stored encrypted with AEAD. AAD binding: `{billing_account_id, connection_id, provider}` prevents ciphertext rebind across tenants. Key from env, not DB. Versioned key IDs for rotation.

5. **GRANT_AUTHORIZES_CONNECTION**: Request-provided `connectionIds` is a declaration, not authorization. Authorization comes from ExecutionGrant scopes only. Effective allowlist = `grantAllowed ∩ requestDeclared`. Enforce membership before `broker.resolve()` (deny fast).

6. **SINGLE_AUTH_PATH**: Same credential resolution for all tools regardless of source (`@cogni/ai-tools` or MCP). No forked logic.

7. **REFRESH_WITH_TIMEOUT**: Background refresh preferred (jittered window before expiry). Synchronous refresh allowed with bounded timeout. On timeout/failure: typed error, metric emitted, tool invocation fails.

8. **ONE_CONNECTION_PER_CALL**: Authenticated tool invocations must specify exactly one `connectionId` via tool args (uuid-validated). No implicit selection from `connectionIds[]` allowlist. No context magic.

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

| File                                                 | Change                                            |
| ---------------------------------------------------- | ------------------------------------------------- |
| `src/shared/db/schema.connections.ts`                | New table with audit columns                      |
| `src/ports/connection-broker.port.ts`                | `resolveForTool({connectionId, toolId, subject})` |
| `src/adapters/server/connections/drizzle.adapter.ts` | AEAD decryption, AAD + tenant validation          |
| `@cogni/ai-core/tooling/tool-runner.ts`              | Inject broker, enforce grant intersection         |

---

## Design Decisions

### 1. Why Broker at Invocation?

Resolving at request time risks token expiry mid-run. Resolving at invocation keeps tokens fresh and enables transparent refresh without graph awareness.

### 2. Connection Scoping

Connections are tenant-scoped, not tool-scoped. A GitHub connection serves any tool needing GitHub access. Request `connectionIds` declares intent; ExecutionGrant scopes authorize. Effective = intersection.

### 3. Authorization Flow

1. Request declares `connectionIds[]` (intent)
2. ExecutionGrant contains `connection:use:{id}` scopes (authorization)
3. toolRunner computes `effectiveAllowed = grant ∩ request`
4. Tool invocation specifies one `connectionId` via args (per ONE_CONNECTION_PER_CALL)
5. Membership check before `broker.resolveForTool()` — deny fast if not in effectiveAllowed
6. Broker verifies `connection.billing_account_id == subject.billingAccountId` (defense-in-depth)

---

## Anti-Patterns

| Pattern                         | Problem                                   |
| ------------------------------- | ----------------------------------------- |
| Tokens in `configurable`        | Serialized, logged, visible in traces     |
| Different auth per tool source  | Fragments codebase, policy confusion      |
| Tools calling broker directly   | Bypasses grant enforcement, audit         |
| Trust request connectionIds     | Confused-deputy; must intersect w/ grant  |
| Implicit connectionId selection | Authority leaks; must be explicit in args |
| Resolve at construction         | Stale by execution time                   |

---

## Related Documents

- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md#26) — CONNECTION_ID_ONLY invariant
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md#30) — No secrets in configurable
- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — ExecutionGrant scopes

---

**Last Updated**: 2026-01-24
**Status**: Draft
