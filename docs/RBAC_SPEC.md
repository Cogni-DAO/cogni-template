# Authorization (RBAC/ReBAC) Design

> [!CRITICAL]
> Every protected action requires `AuthorizationPort.check(actor, subject?, action, resource, context)`. When `subject` is present (agent acting on behalf of user), BOTH the subject's permission AND the actor's delegation must be verified. OpenFGA is the sole source of truth.

## Core Invariants

1. **CONTEXT_HAS_ACTOR_SUBJECT_TENANT_GRAPH**: Every `ToolInvocationContext` and `GraphRunContext` must include `{ actorId, tenantId, graphId }` and optionally `{ subjectId }` for on-behalf-of runs. No secrets in context — only opaque references.

2. **AUTHZ_CHECK_BEFORE_TOOL_EXEC**: `toolRunner.exec()` must call `AuthorizationPort.check(actor, subject?, 'tool.execute', tool:{toolId}, ctx)` BEFORE tool execution. When subject is present, enforces dual check.

3. **AUTHZ_CHECK_BEFORE_TOKEN_MINT**: `ConnectionBroker.resolveForTool()` must call `AuthorizationPort.check(actor, subject?, 'connection.use', connection:{connectionId}, ctx)` BEFORE token materialization. Credential faucet gate.

4. **DENY_BY_DEFAULT_AUTHZ**: If no explicit relation exists in OpenFGA, the check returns DENY. No fallback to "allow if not denied" patterns.

5. **OBO_SUBJECT_MUST_BE_BOUND**: `subjectId` cannot be supplied by agents, tools, or request parameters. It is set ONLY from server-issued grants, sessions, or execution contexts. Prevents impersonation-by-parameter attacks.

---

## Actor Types

| Type    | Format                  | Description                          |
| ------- | ----------------------- | ------------------------------------ |
| User    | `user:{walletAddress}`  | Human with authenticated wallet      |
| Agent   | `agent:{agentId}`       | Autonomous agent (graph instance)    |
| Service | `service:{serviceName}` | Internal service (scheduler, worker) |

**Actor** = who is making the request.
**Subject** = on whose behalf (always a user; only present for delegated execution).

---

## Dual-Check Enforcement

When `subject` is present (agent acting on behalf of user):

```
┌─────────────────────────────────────────────────────────────────────┐
│ DELEGATED EXECUTION CHECK                                           │
│ ─────────────────────────                                           │
│ 1. OpenFGA: ALLOW(subject, action, resource)?                       │
│    └─ Does the USER have permission for this action?                │
│                                                                     │
│ 2. OpenFGA: ALLOW(actor, 'user.act_as', user:{subject})?            │
│    └─ Is the AGENT authorized to act on behalf of this user?        │
│                                                                     │
│ 3. BOTH must return ALLOW. Either DENY → reject.                    │
└─────────────────────────────────────────────────────────────────────┘
```

When `subject` is absent (direct user or service action):

```
┌─────────────────────────────────────────────────────────────────────┐
│ DIRECT EXECUTION CHECK                                              │
│ ─────────────────────────                                           │
│ 1. OpenFGA: ALLOW(actor, action, resource)?                         │
│    └─ Does the actor have permission for this action?               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Checklist

### P0: RBAC Spine

**AuthorizationPort (`src/ports/`):**

- [ ] Create `AuthorizationPort` interface:
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
- [ ] Implement dual-check logic: if `subject` present, verify BOTH permission AND delegation
- [ ] Add to `src/ports/index.ts` exports
- [ ] Create `FakeAuthorizationAdapter` for tests

**OpenFGA Adapter (`src/adapters/server/authz/`):**

- [ ] Create `OpenFgaAuthorizationAdapter` implementing `AuthorizationPort`
- [ ] Implement `checkWithSubject()` for dual OpenFGA queries
- [ ] Configure OpenFGA store per environment (single store per env)
- [ ] Add `OPENFGA_API_URL`, `OPENFGA_STORE_ID` to env validation
- [ ] Add retry + timeout handling (500ms default, 3 retries)

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

**Enforcement Points:**

- [ ] Wire `AuthorizationPort` into `toolRunner.exec()` (check before execution)
- [ ] Wire `AuthorizationPort` into `ConnectionBroker.resolveForTool()` (check before token)
- [ ] Pass actor + subject through entire call chain

**Architectural Tests (`tests/arch/`):**

- [ ] `authz-required-at-tool-exec.test.ts` — no tool.exec without authz
- [ ] `authz-required-at-broker.test.ts` — no broker.resolve without authz
- [ ] `subject-binding-trusted.test.ts` — subjectId only from server

**Composition Root (`src/bootstrap/`):**

- [ ] Add `AuthorizationPort` to container
- [ ] Wire `OpenFgaAuthorizationAdapter` in prod/staging
- [ ] Wire `FakeAuthorizationAdapter` in test

#### Chores

- [ ] Observability [observability.md](../.agent/workflows/observability.md)
- [ ] Documentation [document.md](../.agent/workflows/document.md)

### P1: Graph Invoke + Audit Events

- [ ] Add `graph.invoke` check at `GraphExecutorPort.runGraph()` entry
- [ ] Emit `authz.check` audit events with actor + subject
- [ ] Add caching layer (LRU, 5s TTL, keyed by actor:subject:action:resource)
- [ ] Add batch check API for tool catalog filtering

### P2: Delegation Management (Do NOT Build Yet)

- [ ] UI for managing agent delegations
- [ ] Delegation scopes (limit what agents can do on behalf of user)
- [ ] Time-bounded delegations
- [ ] Condition: need agent management UI first

---

## File Pointers (P0 Scope)

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

---

## Schema: OpenFGA Authorization Model

```dsl
type user
  relations
    define delegates: [agent]

type agent

type service

type tenant
  relations
    define admin: [user, service]
    define member: [user] or admin

type graph
  relations
    define owner: [user]
    define tenant: [tenant]
    define can_invoke: [user, agent, service] or owner or member from tenant

type tool
  relations
    define graph: [graph]           # Parent link: which graph owns this tool
    define can_execute: [user, agent, service] or can_invoke from graph

type connection
  relations
    define owner: [user]
    define tenant: [tenant]         # Parent link: which tenant owns this connection
    define can_use: [user, agent, service] or owner or member from tenant
```

**Parent Relations:** `tool.graph` and `connection.tenant` are required for computed permissions (`can_invoke from graph`, `member from tenant`).

---

## Action→Relation Mapping

| Action           | Resource Type     | OpenFGA Check                            | Error Code     |
| ---------------- | ----------------- | ---------------------------------------- | -------------- |
| `tool.execute`   | `tool:{id}`       | `check(actor, can_execute, tool:{id})`   | `authz_denied` |
| `connection.use` | `connection:{id}` | `check(actor, can_use, connection:{id})` | `authz_denied` |
| `graph.invoke`   | `graph:{id}`      | `check(actor, can_invoke, graph:{id})`   | `authz_denied` |
| `user.act_as`    | `user:{wallet}`   | `check(actor, delegates, user:{wallet})` | `authz_denied` |

**Delegation relation:** `user.delegates` grants agents the right to act on behalf of user. Dual-check queries `user.act_as` when `subject` is present.

---

## Trusted Boundaries for subjectId

`subjectId` may ONLY be set at these code locations:

| Boundary             | Location                                         | How subjectId is bound                 |
| -------------------- | ------------------------------------------------ | -------------------------------------- |
| Session middleware   | `src/proxy.ts`                                   | Extracted from session JWT claims      |
| Agent grant issuance | `src/features/agents/services/grant.ts` (future) | Bound when grant is created            |
| Scheduler job        | `src/adapters/server/scheduler/`                 | Hardcoded to job owner at job creation |

**Never from:** Request body, query params, tool args, `RunnableConfig.configurable`.

---

## Resource ID Format

- `tenant:{id}` — billing account / tenant
- `graph:{id}` — graph definition
- `tool:{id}` — tool ID (namespaced: `core__get_current_time`)
- `connection:{id}` — connection UUID

---

## Design Decisions

### 1. Actor vs Subject

| Scenario                | Actor               | Subject       | Checks                                                                       |
| ----------------------- | ------------------- | ------------- | ---------------------------------------------------------------------------- |
| User executes directly  | `user:0x1234`       | —             | `ALLOW(user, action, resource)`                                              |
| Agent on behalf of user | `agent:chat-v1`     | `user:0x1234` | `ALLOW(user, action, resource)` AND `ALLOW(agent, user.act_as, user:0x1234)` |
| Service (scheduler)     | `service:scheduler` | —             | `ALLOW(service, action, resource)`                                           |

**Why dual-check for OBO?** The user must have the permission, AND the agent must be delegated. This prevents:

- Agents with broad delegation accessing resources the user can't access
- Users delegating to agents they don't control

### 2. Why Subject from Server Only

If `subjectId` came from request parameters, an agent could claim to act on behalf of any user. By binding `subjectId` only at session/grant issuance:

- Server cryptographically attests to the delegation
- Agents cannot escalate by changing parameters
- Audit trail is trustworthy

### 3. Authorization Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ REQUEST INGRESS                                                     │
│ ─────────────────                                                   │
│ 1. Extract JWT from session/bearer                                  │
│ 2. Determine actor type:                                            │
│    - Session JWT → user:{walletAddress}                             │
│    - Agent token → agent:{agentId} + subject from grant             │
│    - Service key → service:{serviceName}                            │
│ 3. Attach { actorId, subjectId?, tenantId } to request context      │
│ 4. Forward to graph executor / tool runner                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TOOL EXECUTION (blocking)                                           │
│ ─────────────────────────                                           │
│ 1. toolRunner.exec() receives ctx with actorId + subjectId?         │
│ 2. AuthorizationPort.check(actor, subject?, "tool.execute", tool)   │
│    └─ If subject: dual-check (permission + delegation)              │
│ 3. if DENY → { ok: false, errorCode: "authz_denied" }               │
│ 4. if ALLOW → proceed to execution                                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if tool requires connection)
┌─────────────────────────────────────────────────────────────────────┐
│ CONNECTION RESOLUTION (blocking)                                    │
│ ───────────────────────────                                         │
│ 1. Broker receives connectionId from ctx                            │
│ 2. AuthorizationPort.check(actor, subject?, "connection.use", conn) │
│    └─ If subject: dual-check (permission + delegation)              │
│ 3. if DENY → { ok: false, errorCode: "authz_denied" }               │
│ 4. if ALLOW → decrypt + return token via AuthCapability             │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Enforcement Order + Error Codes

Checks are ordered cheapest-first to fail fast:

```
toolRunner.exec(toolId, rawArgs, ctx)
    │
    ├─ 1. ToolPolicy.decide(toolId, effect)        ← In-memory allowlist (cheap)
    │      └─ deny → { errorCode: 'policy_denied' }
    │
    ├─ 2. AuthorizationPort.check(actor, subject?, action, resource)  ← OpenFGA (network)
    │      └─ deny → { errorCode: 'authz_denied' }
    │
    ├─ 3. Grant intersection (if connection required)  ← In-memory set intersection
    │      └─ connectionId ∉ effective → { errorCode: 'policy_denied' }
    │
    ├─ 4. ConnectionBroker.resolveForTool()        ← Only after authz passes
    │      └─ (token materialization happens here)
    │
    └─ 5. Tool execution proceeds
```

| Error Code      | Meaning                                                       | Source            |
| --------------- | ------------------------------------------------------------- | ----------------- |
| `policy_denied` | Tool not in allowlist OR connection not in grant intersection | ToolPolicy, Grant |
| `authz_denied`  | OpenFGA check returned DENY (permission or delegation)        | AuthorizationPort |
| `unavailable`   | Tool not found in catalog                                     | ToolSourcePort    |

**Key:** `policy_denied` is local/cheap checks; `authz_denied` is centralized OpenFGA.

### 5. Audit Events

Every `AuthorizationPort.check()` emits:

```typescript
{
  type: "authz.check",
  actor: string,
  subject?: string,        // Present for OBO
  action: AuthzAction,
  resource: string,
  decision: "allow" | "deny",
  delegationChecked: boolean,  // True if dual-check performed
  durationMs: number,
  cached: boolean,
  tenantId: string,
  runId?: string,
}
```

**Why log both actor and subject?** Explicit audit trail. When reviewing logs:

- "Who actually did it?" → actor
- "On whose authority?" → subject

### 6. Caching Strategy (P1)

**Cache key:** `${actor}:${subject ?? 'direct'}:${action}:${resource}`

Subject included in cache key because delegation status can change independently of resource permissions.

**TTL:** 5 seconds.

---

## Anti-Patterns

| Pattern                             | Problem                         |
| ----------------------------------- | ------------------------------- |
| Subject from request body           | Impersonation-by-parameter      |
| Single check for OBO                | Missing delegation verification |
| Actor-only audit logging            | Can't trace delegation chain    |
| Caching without subject in key      | Stale delegation decisions      |
| Bespoke role tables per service     | Fragmented policy               |
| Checking authz after broker.resolve | Token already materialized      |
| Allowing by default if check fails  | Fails open; must fail closed    |

---

## Related Documents

- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution pipeline, DENY_BY_DEFAULT
- [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) — Connection auth, GRANT_INTERSECTION
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — Graph executor, billing idempotency
- [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md) — Authentication (SIWE, API keys)

---

**Last Updated**: 2026-02-01
**Status**: Draft (Rev 2 - Actor/subject separation for agent delegation)
