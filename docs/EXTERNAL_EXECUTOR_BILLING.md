# External Executor Billing Design

> [!CRITICAL]
> External executors use **async reconciliation** via provider billing APIs. Identity key is `end_user = billingAccountId` (matching in-proc `LiteLlmAdapter`). Run correlation via `metadata.run_id`. Reconcilers call `commitUsageFact()` per LLM call with `usageUnitId = provider_call_id`.

## Core Invariants

1. **END_USER_IS_BILLING_ACCOUNT**: All executors (in-proc, sandbox, external) set `end_user = billingAccountId`. This matches the in-proc `LiteLlmAdapter` (`user: billingAccountId`) and the activity dashboard query (`/spend/logs?end_user=billingAccountId`). Run correlation uses `metadata.run_id`, NOT `end_user`.

2. **USAGE_UNIT_IS_PROVIDER_CALL_ID**: Each LLM call has a unique `usageUnitId = spend_logs.request_id`. Multiple charge_receipts per run is expected for multi-step graphs.

3. **SERVER_SETS_IDENTITY_NEVER_CLIENT**: Identity headers/fields are server-set. In-proc: `user` body field. Sandbox: proxy overwrites `x-litellm-end-user-id` + `x-litellm-metadata`. External: `configurable.user`. Client values stripped/ignored.

4. **RECONCILE_AFTER_STREAM_COMPLETES**: Reconciliation triggers after stream ends (success or error). No grace window for MVP—LiteLLM writes are synchronous with response.

5. **STREAM_EVENTS_ARE_UX_ONLY**: `usage_report` events from external executors are telemetry hints. Authoritative billing flows through reconciliation only.

6. **ONE_LEDGER_WRITER_PRESERVED**: Reconcilers call `commitUsageFact()` → `recordChargeReceipt()`. Never direct DB writes.

7. **IDEMPOTENCY_VIA_SOURCE_REFERENCE**: `source_reference = ${runId}/${attempt}/${provider_call_id}`. Replayed reconciliation is no-op.

8. **METADATA_PARITY**: All executors must produce equivalent LiteLLM metadata. Required fields: `run_id`, `attempt`, `cogni_billing_account_id`, `request_id`. Langfuse fields: `existing_trace_id`, `session_id`, `trace_user_id`. In-proc sets via request body `metadata`; sandbox sets via `x-litellm-metadata` header; external sets via `configurable`.

---

## Reconciliation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ EXECUTION PHASE                                                 │
├─────────────────────────────────────────────────────────────────┤
│ All executors set: end_user = billingAccountId                  │
│ All executors set: metadata.run_id = runId                      │
│ LLM call → LiteLLM stores: end_user + metadata in spend_logs   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ RECONCILIATION PHASE (after stream completes)                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. Query: GET /spend/logs?end_user=${billingAccountId}          │
│    (optionally scoped by start_date/end_date to run window)     │
│ 2. Filter returned logs: entry.metadata.run_id === runId        │
│ 3. For each matching entry:                                     │
│    - usageUnitId = entry.request_id                             │
│    - costUsd = entry.spend                                      │
│    - tokens = entry.prompt_tokens + entry.completion_tokens     │
│ 4. commitUsageFact() per entry                                  │
│ 5. Log metric: external_billing.reconcile_success               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Provider-Specific Details

### LangGraph Server (LiteLLM) — MVP

| Aspect          | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| Billing source  | LiteLLM `/spend/logs` API                                      |
| Identity field  | `end_user = billingAccountId` (set via `configurable.user`)    |
| Run correlation | `metadata.run_id` (set via `configurable` or LiteLLM metadata) |
| Call ID field   | `spend_logs.request_id`                                        |
| ExecutorType    | `langgraph_server`                                             |
| SourceSystem    | `litellm`                                                      |

**Validated:** `initChatModel({ configurableFields: ["model", "user"] })` propagates `configurable.user` to OpenAI `user` field → LiteLLM `end_user`.

### Sandbox (LiteLLM via nginx proxy) — P0.75

| Aspect          | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| Billing source  | LiteLLM `/spend/logs` API                                                        |
| Identity field  | `end_user = billingAccountId` (set via `x-litellm-end-user-id`)                  |
| Run correlation | `metadata.run_id` (set via `x-litellm-metadata` header)                          |
| Call ID field   | `spend_logs.request_id` (logged in proxy via `$upstream_http_x_litellm_call_id`) |
| ExecutorType    | `sandbox`                                                                        |
| SourceSystem    | `litellm`                                                                        |

**Mechanism:** Proxy injects `x-litellm-end-user-id` and `x-litellm-metadata` headers. Both overwrite any client-sent values. Sandbox cannot spoof identity. See [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) invariant #10.

### Claude SDK — P2

| Aspect         | Value                        |
| -------------- | ---------------------------- |
| Billing source | `message.usage` (in-process) |
| Call ID field  | `message.id`                 |
| ExecutorType   | `claude_sdk`                 |
| SourceSystem   | `anthropic_sdk`              |

**Decision pending:** If SDK runs in-process, use real-time capture (no reconciliation). If external, same pattern with Anthropic usage API.

### n8n / Flowise — Future

**Invariant:** Must route LLM calls through our LiteLLM instance. Same `end_user` correlation pattern applies.

---

## Implementation Checklist

### P0: LangGraph Server Reconciliation

- [x] `initChatModel` includes `"user"` in `configurableFields`
- [x] Validated: `end_user` populated in LiteLLM spend_logs
- [ ] Change `configurable.user` from `${runId}/${attempt}` to `billingAccountId` (align with in-proc)
- [ ] Pass `run_id` and `attempt` via LiteLLM metadata instead of `end_user`
- [ ] Add `getSpendLogsByEndUser(endUser)` to LiteLLM adapter
- [ ] Create `reconcileRun()` in `external-reconciler.ts` (query by billingAccountId, filter by metadata.run_id)
- [ ] Wire reconciler call after stream completes in provider
- [ ] Stack test: chat → charge_receipts created via reconciliation

### P1: Hardening

- [ ] Alert on reconciliation failures
- [ ] Retry logic for transient LiteLLM API errors
- [ ] Metrics: `external_billing.reconcile_latency_ms`

---

## File Pointers

| File                                                       | Change                                    |
| ---------------------------------------------------------- | ----------------------------------------- |
| `packages/langgraph-graphs/src/graphs/*/server.ts`         | `configurableFields: ["model", "user"]`   |
| `src/adapters/server/ai/langgraph/dev/provider.ts`         | `configurable.user = ${runId}/${attempt}` |
| `src/adapters/server/ai/litellm.activity-usage.adapter.ts` | Add `getSpendLogsByEndUser()`             |
| `src/features/ai/services/external-reconciler.ts`          | New: `reconcileRun()` function            |

---

## Anti-Patterns

| Anti-Pattern                            | Why Forbidden                                                     |
| --------------------------------------- | ----------------------------------------------------------------- |
| Trust client-supplied `user`            | Billing spoofing                                                  |
| `end_user = runId/attempt`              | Breaks activity dashboard; use billingAccountId + metadata.run_id |
| Filter by metadata at LiteLLM API level | Not supported; fetch by end_user, filter in-memory                |
| Stream events as billing source         | Unreliable, may drop                                              |
| Skip `attempt` in correlation           | Retries create duplicates                                         |
| Direct charge_receipts mutation         | Violates ONE_LEDGER_WRITER                                        |
| Different `end_user` per executor type  | All executors must use billingAccountId for dashboard parity      |

---

## New Executor Integration Checklist

Any new executor must answer:

1. **Authoritative billing source?** (API endpoint or in-process capture)
2. **Correlation key we control?** (e.g., `end_user`, `metadata`, header)
3. **Provider call ID for usageUnitId?** (unique per LLM call)
4. **Idempotent flow through commitUsageFact?** (source_reference format)

---

## Related Docs

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — ONE_LEDGER_WRITER, UsageFact, invariants 41-47
- [LANGGRAPH_SERVER.md](LANGGRAPH_SERVER.md) — LangGraph Server adapter (uses this pattern)
- [CLAUDE_SDK_ADAPTER_SPEC.md](CLAUDE_SDK_ADAPTER_SPEC.md) — In-process adapter (does NOT use reconciliation)
- [N8N_ADAPTER_SPEC.md](N8N_ADAPTER_SPEC.md) — External adapter (uses this pattern)
- [CLAWDBOT_ADAPTER_SPEC.md](CLAWDBOT_ADAPTER_SPEC.md) — External runtime adapter (uses this pattern)
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md) — Charge receipt schema

---

**Last Updated**: 2026-02-06
**Status**: Validated (end_user correlation proven in spend_logs). Updated: end_user = billingAccountId (not runId), run correlation via metadata.
