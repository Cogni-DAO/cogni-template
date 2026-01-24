# Tenant Connections Design

> [!CRITICAL]
> Graphs carry `connectionId` only, never credentials. Connection Broker resolves tokens at tool invocation time.

## Core Invariants

1. **CONNECTION_ID_ONLY**: Tools receive `connectionId` (opaque reference), never raw tokens. No secrets in `configurable`, `ToolPolicyContext`, or graph state.

2. **BROKER_AT_INVOCATION**: Token resolution happens inside `toolRunner.exec()`, not at graph construction or request ingress. Enables lazy refresh without blocking execution.

3. **TENANT_SCOPED**: Connections belong to `billing_account_id`. Cross-tenant access forbidden. ExecutionGrants include `connection:use:{connectionId}` scopes.

4. **ENCRYPTED_AT_REST**: Credentials stored encrypted. Key from env, not DB. Versioned key IDs for rotation.

5. **SINGLE_AUTH_PATH**: Same credential resolution for all tools regardless of source (`@cogni/ai-tools` or MCP). No forked logic.

6. **REFRESH_BEFORE_EXPIRY**: Broker refreshes OAuth tokens proactively. Tool invocation never blocks on refresh flow.

---

## Schema: `connections`

| Column                  | Type        | Notes                               |
| ----------------------- | ----------- | ----------------------------------- |
| `id`                    | uuid        | PK                                  |
| `billing_account_id`    | text        | FK, tenant scope                    |
| `provider`              | text        | `github`, `bluesky`, `google`       |
| `credential_type`       | text        | `oauth2`, `app_password`, `api_key` |
| `encrypted_credentials` | bytea       | Encrypted JSON blob                 |
| `encryption_key_id`     | text        | For key rotation                    |
| `scopes`                | text[]      | OAuth scopes granted                |
| `expires_at`            | timestamptz | NULL if no expiry                   |
| `created_at`            | timestamptz |                                     |

**Forbidden:** Plaintext `access_token`/`refresh_token` columns. User-scoped connections (tenant-only).

---

## Implementation Checklist

### P0: Connection Model

- [ ] Create `connections` table with encrypted storage
- [ ] Create `ConnectionBrokerPort`: `resolve(connectionId) → Credential`
- [ ] Implement `DrizzleConnectionBrokerAdapter` with decryption
- [ ] Extend `ToolPolicyContext` with `connectionIds?: readonly string[]`
- [ ] Wire broker into `toolRunner.exec()` for resolution
- [ ] First type: `app_password` (Bluesky) — no OAuth

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

| File                                                 | Change                         |
| ---------------------------------------------------- | ------------------------------ |
| `src/shared/db/schema.connections.ts`                | New table                      |
| `src/ports/connection-broker.port.ts`                | New port interface             |
| `src/adapters/server/connections/drizzle.adapter.ts` | Broker implementation          |
| `@cogni/ai-core/tooling/runtime/tool-policy.ts`      | Add `connectionIds` to context |
| `@cogni/ai-core/tooling/tool-runner.ts`              | Wire broker for resolution     |

---

## Design Decisions

### 1. Why Broker at Invocation?

Resolving at request time risks token expiry mid-run. Resolving at invocation keeps tokens fresh and enables transparent refresh without graph awareness.

### 2. Connection Scoping

Connections are tenant-scoped, not tool-scoped. A GitHub connection serves any tool needing GitHub access. `connectionIds` in request declares available credentials; `toolIds` declares allowed capabilities.

### 3. ExecutionGrant Integration

Scheduled runs validate `connection:use:{connectionId}` scopes before tool invocation. Missing scope = tool denied.

---

## Anti-Patterns

| Pattern                        | Problem                               |
| ------------------------------ | ------------------------------------- |
| Tokens in `configurable`       | Serialized, logged, visible in traces |
| Different auth per tool source | Fragments codebase, policy confusion  |
| User-scoped connections        | Breaks tenant isolation               |
| Resolve at construction        | Stale by execution time               |

---

## Related Documents

- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md#26) — CONNECTION_ID_ONLY invariant
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md#30) — No secrets in configurable
- [SCHEDULER_SPEC.md](SCHEDULER_SPEC.md) — ExecutionGrant scopes

---

**Last Updated**: 2026-01-24
**Status**: Draft
