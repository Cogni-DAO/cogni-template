# Clawdbot (Moltbot) GraphExecutor Adapter Design

> [!CRITICAL]
> Clawdbot is an **external runtime**. All model calls route through LiteLLM with `user = ${runId}/${attempt}` for billing correlation. Reconciliation via LiteLLM spend logs (invariants 41-47).

## Core Invariants

1. **CLAWDBOT_IS_RUNTIME**: Adapter treats Clawdbot as opaque executor implementing `GraphExecutorPort`. We do NOT run LangGraph graphs inside it.

2. **ALL_MODELS_VIA_LITELLM**: Configure Moltbot `models.providers.cogni` with `baseUrl` pointing to LiteLLM. No direct upstream provider keys.

3. **USER_FIELD_CORRELATION**: Adapter sets `user = ${runId}/${attempt}` in request body. Clawdbot must forward this to LiteLLM. LiteLLM stores as `end_user`. Reconciler queries by `end_user`.

4. **BILLING_VIA_RECONCILIATION**: Stream events are UX hints. Authoritative billing via `reconcileRun()` querying LiteLLM `/spend/logs?end_user=${runId}/${attempt}`.

5. **SANDBOX_ENABLED**: `sandbox.mode = "all"`, `sandbox.scope = "session"`. Required because Clawdbot can install/run untrusted skills from ClawdHub.

6. **ELEVATED_DISABLED**: `tools.elevated.enabled = false`. Elevated exec bypasses sandboxing—must never be enabled.

7. **NO_SECRETS_IN_CLAWDBOT**: Clawdbot runtime never receives raw credentials for privileged integrations. Only `connectionId` handles. (P1: privileged integrations via bridge tool.)

---

## Architecture

```
ClawdbotExecutorAdapter.runGraph(request)
    │
    │  POST /v1/chat/completions
    │  user = ${runId}/${attempt}
    │  model = "moltbot:<agentId>"
    ▼
┌─────────────────────────────────────┐
│ Moltbot Gateway                     │
│ - sandbox.mode = "all"              │
│ - elevated.enabled = false          │
│ - models.providers.cogni → LiteLLM  │
└─────────────────────────────────────┘
    │
    │  LLM calls with user field forwarded
    ▼
┌─────────────────────────────────────┐
│ LiteLLM Proxy                       │
│ - stores end_user = runId/attempt   │
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

| Question                          | Answer                                        |
| --------------------------------- | --------------------------------------------- |
| **Authoritative billing source?** | LiteLLM `/spend/logs` API                     |
| **Correlation key?**              | `end_user = ${runId}/${attempt}` (server-set) |
| **usageUnitId?**                  | `spend_logs.request_id` per LLM call          |
| **Idempotency key?**              | `${runId}/${attempt}/${request_id}`           |

---

## Implementation Checklist

### P0: Validate User Field Forwarding

**This is a gate.** Before building the adapter, confirm Clawdbot forwards `user` to upstream.

- [ ] Deploy Clawdbot with LiteLLM provider config
- [ ] Call `/v1/chat/completions` with `"user": "test-run/0"`
- [ ] Query LiteLLM `/spend/logs` — verify `end_user = "test-run/0"`
- [ ] **If works:** proceed to P0 Adapter
- [ ] **If NOT forwarded:** fork Clawdbot to add forwarding before proceeding

### P0: Adapter

- [ ] Create `ClawdbotExecutorAdapter` implementing `GraphExecutorPort`
- [ ] POST to Moltbot `/v1/chat/completions` with `stream: true`
- [ ] Set `user = ${runId}/${attempt}` in request body (server-side, never client)
- [ ] Agent selection via `model: "moltbot:<agentId>"`
- [ ] Parse SSE stream → `AiEvent` (text_delta, tool events, done)
- [ ] After stream completes: call `reconcileRun(runId, attempt)`
- [ ] Wire into `AggregatingGraphExecutor` via bootstrap

### P0: Infrastructure

- [ ] Moltbot config with LiteLLM provider + sandbox settings:
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
        "model": { "primary": "cogni/gpt-4o" },
        "sandbox": {
          "mode": "all",
          "scope": "session"
        }
      }
    },
    "tools": {
      "elevated": { "enabled": false }
    }
  }
  ```
- [ ] Docker Compose service definition
- [ ] Gateway auth via token mode

### P0: Validation

- [ ] Stack test: chat via Clawdbot → `charge_receipts` created via reconciliation
- [ ] Verify `end_user` populated correctly in LiteLLM spend logs
- [ ] Verify idempotency: replay reconciliation → no duplicate receipts

---

## File Pointers

| File                                                  | Change                                      |
| ----------------------------------------------------- | ------------------------------------------- |
| `src/adapters/server/ai/clawdbot/executor.ts`         | `ClawdbotExecutorAdapter` implementing port |
| `src/adapters/server/ai/clawdbot/sse-parser.ts`       | SSE stream → AiEvent normalization          |
| `src/adapters/server/ai/clawdbot/index.ts`            | Barrel export                               |
| `src/adapters/server/index.ts`                        | Export adapter                              |
| `src/bootstrap/graph-executor.factory.ts`             | Wire into aggregator                        |
| `packages/ai-core/src/usage/usage.ts`                 | Add `clawdbot` to `ExecutorType`            |
| `platform/infra/services/clawdbot/docker-compose.yml` | Service definition                          |
| `platform/infra/services/clawdbot/moltbot.json`       | Provider config                             |

---

## Fork Path (if user field not forwarded)

If P0 validation shows Clawdbot does NOT forward `user` to upstream:

1. Fork [clawdbot/clawdbot](https://github.com/clawdbot/clawdbot)
2. Find upstream LLM call code
3. Add: forward inbound `user` field to upstream request
4. Test: `user` reaches LiteLLM `end_user`
5. Use fork until/unless merged upstream

---

## Anti-Patterns

| Pattern                         | Why It's Wrong                                     |
| ------------------------------- | -------------------------------------------------- |
| Direct provider keys in Moltbot | Bypasses LiteLLM metering; billing broken          |
| `elevated.enabled = true`       | Collapses sandbox security boundary                |
| Secrets in Moltbot config       | Skills are untrusted code; secrets will leak       |
| Trust stream events for billing | External executor; reconciliation is authoritative |
| Client-supplied `user` field    | Billing spoofing (invariant 43)                    |

---

## Roadmap (Post-MVP)

**P1: Privileged Integrations**

- Cogni bridge tool for OAuth-protected integrations (Slack, Gmail, etc.)
- Egress allowlist hardening at Docker/iptables layer

**P2: Advanced**

- ClawdHub skill curation/mirroring
- Workspace persistence across sessions

---

## Related Docs

- [EXTERNAL_EXECUTOR_BILLING.md](EXTERNAL_EXECUTOR_BILLING.md) — Reconciliation pattern
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, invariants 41-47
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution, CONNECTION_ID_ONLY (P1)

---

**Last Updated**: 2026-01-30
**Status**: Draft (MVP)
