# Clawdbot (Moltbot) GraphExecutor Adapter Design

> [!CRITICAL]
> Clawdbot is an **internal executor** with persistent DAO workspace. Not user-invocable—requires internal ExecutionGrant. Billing via `x-litellm-end-user-id` header. Temporal is scheduler-of-record.

## Core Invariants

1. **CLAWDBOT_IS_INTERNAL_EXECUTOR**: Not wired into user-facing `AggregatingGraphExecutor`. Only invocable via internal paths with validated ExecutionGrant (internal actorType).

2. **ONE_WORKSPACE_PER_DAO**: Persistent bind-mounted workspace at `/dao/<daoId>`. All sessions share the workspace. Skills and state persist.

3. **ALL_MODELS_VIA_LITELLM**: Configure `models.providers.cogni` with `baseUrl` pointing to LiteLLM (standalone) or CogniGateway (in-sandbox). No direct upstream provider keys.

4. **HEADER_BASED_BILLING**: Adapter sets `x-litellm-end-user-id: ${runId}/${attempt}` header for billing correlation. `user` field reserved for Moltbot session routing (stable: `daoId` or `daoId/endUserId`).

5. **BILLING_VIA_RECONCILIATION**: Stream events are UX hints. Authoritative billing via `reconcileRun()` querying LiteLLM `/spend/logs?end_user=${runId}/${attempt}`.

6. **TEMPORAL_IS_SCHEDULER**: Moltbot cron disabled (`cron.enabled=false`). All scheduling via Temporal workflows invoking the adapter.

7. **SANDBOX_ENABLED**: `sandbox.mode=all`, `sandbox.scope=session`, `sandbox.workspaceAccess=rw`. Sessions isolated but share persistent workspace.

8. **ELEVATED_DISABLED**: `tools.elevated.enabled=false`. Must never be enabled.

9. **NO_SECRETS_IN_CLAWDBOT**: Runtime never receives raw credentials. Only `connectionId` handles. (P1: privileged integrations via bridge tool.)

---

## Architecture

```
[Temporal Workflow / Internal System]
    │
    │  Validated ExecutionGrant (internal actorType)
    ▼
ClawdbotExecutorAdapter.runGraph(request)
    │
    │  POST /v1/chat/completions
    │  Header: x-litellm-end-user-id = ${runId}/${attempt}
    │  Body: user = ${daoId} (session routing, stable)
    │  Body: model = "moltbot:<agentId>"
    ▼
┌─────────────────────────────────────┐
│ Moltbot Gateway                     │
│ - workspace = /dao/<daoId>          │
│ - sandbox.mode = all                │
│ - sandbox.scope = session           │
│ - sandbox.workspaceAccess = rw      │
│ - cron.enabled = false              │
│ - elevated.enabled = false          │
│ - models.providers.cogni → LiteLLM  │
└─────────────────────────────────────┘
    │
    │  LLM calls with header forwarded
    ▼
┌─────────────────────────────────────┐
│ LiteLLM Proxy                       │
│ - end_user from x-litellm-* header  │
│ - metered billing per DAO key       │
└─────────────────────────────────────┘
    │
    │  After stream completes
    ▼
reconcileRun() → GET /spend/logs?end_user=... → commitUsageFact()
```

---

## External Executor Billing

Per [EXTERNAL_EXECUTOR_BILLING.md](EXTERNAL_EXECUTOR_BILLING.md):

| Question                          | Answer                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| **Authoritative billing source?** | LiteLLM `/spend/logs` API                                   |
| **Correlation key?**              | `end_user` from `x-litellm-end-user-id` header (server-set) |
| **usageUnitId?**                  | `spend_logs.request_id` per LLM call                        |
| **Idempotency key?**              | `${runId}/${attempt}/${request_id}`                         |

---

## Implementation Checklist

### P0: Validate Header Forwarding

**This is a gate.** Confirm Clawdbot forwards `x-litellm-end-user-id` header to upstream LiteLLM.

- [ ] Deploy Clawdbot with LiteLLM provider config
- [ ] Call `/v1/chat/completions` with header `x-litellm-end-user-id: test-run/0`
- [ ] Query LiteLLM `/spend/logs` — verify `end_user = "test-run/0"`
- [ ] **If works:** proceed to P0 Adapter
- [ ] **If NOT forwarded:** fork Clawdbot to add header forwarding before proceeding

### P0: Adapter

- [ ] Create `ClawdbotExecutorAdapter` implementing `GraphExecutorPort`
- [ ] POST to Moltbot `/v1/chat/completions` with `stream: true`
- [ ] Set header `x-litellm-end-user-id: ${runId}/${attempt}` (billing correlation)
- [ ] Set body `user: ${daoId}` (session routing, stable)
- [ ] Agent selection via `model: "moltbot:<agentId>"`
- [ ] Parse SSE stream → `AiEvent` (text_delta, tool events, done)
- [ ] After stream completes: call `reconcileRun(runId, attempt)`
- [ ] **Do NOT wire into AggregatingGraphExecutor** — internal-only invocation

### P0: Access Control

- [ ] Mark clawdbot graphIds as internal in catalog
- [ ] Require ExecutionGrant with internal actorType to invoke
- [ ] Reject invocation from user-facing routes (chat API, etc.)

### P0: Infrastructure

- [ ] Moltbot config:
  ```json
  {
    "models": {
      "providers": {
        "cogni": {
          "baseUrl": "${LITELLM_BASE_URL}",
          "apiKey": "${LITELLM_API_KEY}",
          "api": "openai-completions"
        }
      }
    },
    "agents": {
      "defaults": {
        "workspace": "/dao/${DAO_ID}",
        "model": { "primary": "cogni/gpt-4o" },
        "sandbox": {
          "mode": "all",
          "scope": "session",
          "workspaceAccess": "rw"
        }
      }
    },
    "tools": {
      "elevated": { "enabled": false }
    },
    "cron": {
      "enabled": false
    }
  }
  ```
- [ ] Docker Compose with bind-mount volume for `/dao/<daoId>`
- [ ] Gateway auth via token mode

### P0: Validation

- [ ] Verify header forwarding: `end_user` populated correctly in LiteLLM spend logs
- [ ] Verify idempotency: replay `reconcileRun()` → no duplicate receipts
- [ ] Verify session continuity: same `user` field → same Moltbot session
- [ ] Verify access control: user-facing routes cannot invoke clawdbot graphs
- [ ] Verify workspace persistence: files/skills persist across sessions

---

## File Pointers

| File                                                  | Change                                      |
| ----------------------------------------------------- | ------------------------------------------- |
| `src/adapters/server/ai/clawdbot/executor.ts`         | `ClawdbotExecutorAdapter` implementing port |
| `src/adapters/server/ai/clawdbot/sse-parser.ts`       | SSE stream → AiEvent normalization          |
| `src/adapters/server/ai/clawdbot/index.ts`            | Barrel export                               |
| `src/adapters/server/index.ts`                        | Export adapter (internal use only)          |
| `packages/ai-core/src/usage/usage.ts`                 | Add `clawdbot` to `ExecutorType`            |
| `platform/infra/services/clawdbot/docker-compose.yml` | Service + volume mount                      |
| `platform/infra/services/clawdbot/moltbot.json`       | Provider + sandbox + cron config            |

**Not in scope:** `graph-executor.factory.ts` — clawdbot is NOT wired into AggregatingGraphExecutor

---

## Fork Path (if header not forwarded)

If P0 validation shows Clawdbot does NOT forward `x-litellm-end-user-id` header:

1. Fork [clawdbot/clawdbot](https://github.com/clawdbot/clawdbot)
2. Find upstream LLM request builder
3. Add header forwarding allowlist (default deny, allow `x-litellm-*` only)
4. Test: header reaches LiteLLM `end_user`
5. Add regression tests
6. Use fork until/unless merged upstream

---

## Anti-Patterns

| Pattern                            | Why It's Wrong                                     |
| ---------------------------------- | -------------------------------------------------- |
| Wire into AggregatingGraphExecutor | Clawdbot is internal-only, not user-invocable      |
| Use `user` field for billing       | `user` is for session routing; headers for billing |
| Direct provider keys in Moltbot    | Bypasses LiteLLM metering; billing broken          |
| `elevated.enabled = true`          | Collapses sandbox security boundary                |
| `cron.enabled = true`              | Conflicts with Temporal as scheduler-of-record     |
| Ephemeral workspace                | Defeats purpose; skills/state must persist         |

---

## Roadmap (Post-MVP)

**P1: Privileged Integrations**

- Cogni bridge tool for OAuth-protected integrations (Slack, Gmail, etc.)
- Egress allowlist hardening at Docker/iptables layer

**P2: Multi-DAO**

- Multiple Clawdbot instances with isolated workspaces
- DAO-specific agent configurations

---

## Sandbox Deployment Model (P0.5+)

> See [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) for full specification.

Clawdbot can run inside a network-isolated sandbox container:

| Aspect           | Standalone Service                        | In-Sandbox (P0.5+)                            |
| ---------------- | ----------------------------------------- | --------------------------------------------- |
| Network          | Direct to LiteLLM                         | `network=none`, via CogniGateway              |
| LLM routing      | Clawdbot → LiteLLM                        | Clawdbot → localhost:8080 → Gateway → LiteLLM |
| Header injection | Clawdbot forwards `x-litellm-end-user-id` | Gateway injects (client-sent ignored)         |
| Workspace        | Persistent `/dao/<daoId>`                 | Ephemeral or persistent via volume            |
| Billing          | Reconciliation via `/spend/logs`          | Same, gateway ensures header injection        |

**In-Sandbox Clawdbot Config**:

```json
{
  "models": {
    "providers": {
      "cogni": {
        "baseUrl": "http://localhost:8080",
        "apiKey": "not-used-gateway-handles-auth"
      }
    }
  }
}
```

**Why Sandbox?** Stricter isolation—no direct network egress, all IO audited by host.

---

## Related Docs

- [EXTERNAL_EXECUTOR_BILLING.md](EXTERNAL_EXECUTOR_BILLING.md) — Reconciliation pattern
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, invariants 41-47
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution, CONNECTION_ID_ONLY (P1)
- [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) — Sandbox phases (P0/P0.5/P1)

---

**Last Updated**: 2026-02-02
**Status**: Draft (MVP)
