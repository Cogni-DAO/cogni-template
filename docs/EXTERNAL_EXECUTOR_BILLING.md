# External Executor Billing Design

> [!CRITICAL]
> External executors use **async reconciliation** via provider billing APIs. Correlation key is `end_user = ${runId}/${attempt}` (server-set, never client-supplied). Reconcilers call `commitUsageFact()` per LLM call with `usageUnitId = provider_call_id`.

## Core Invariants

1. **END_USER_CORRELATION**: LLM calls set `user = ${runId}/${attempt}` server-side via `configurable.user`. LiteLLM stores this as `end_user`. Reconciler queries `GET /spend/logs?end_user=...`.

2. **USAGE_UNIT_IS_PROVIDER_CALL_ID**: Each LLM call has a unique `usageUnitId = spend_logs.request_id`. Multiple charge_receipts per run is expected for multi-step graphs.

3. **SERVER_SETS_USER_NEVER_CLIENT**: Provider passes `configurable.user` server-side. Client-supplied `user` in configurable is ignored/overwritten. This prevents billing spoofing.

4. **RECONCILE_AFTER_STREAM_COMPLETES**: Reconciliation triggers after stream ends (success or error). No grace window for MVP—LiteLLM writes are synchronous with response.

5. **STREAM_EVENTS_ARE_UX_ONLY**: `usage_report` events from external executors are telemetry hints. Authoritative billing flows through reconciliation only.

6. **ONE_LEDGER_WRITER_PRESERVED**: Reconcilers call `commitUsageFact()` → `recordChargeReceipt()`. Never direct DB writes.

7. **IDEMPOTENCY_VIA_SOURCE_REFERENCE**: `source_reference = ${runId}/${attempt}/${provider_call_id}`. Replayed reconciliation is no-op.

---

## Reconciliation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ EXECUTION PHASE                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Provider sets: configurable.user = `${runId}/${attempt}`        │
│ initChatModel has: configurableFields: ["model", "user"]        │
│ LLM call → LiteLLM stores: end_user = `${runId}/${attempt}`     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ RECONCILIATION PHASE (after stream completes)                   │
├─────────────────────────────────────────────────────────────────┤
│ 1. Query: GET /spend/logs?end_user=${runId}/${attempt}          │
│ 2. For each entry:                                              │
│    - usageUnitId = entry.request_id                             │
│    - costUsd = entry.spend                                      │
│    - tokens = entry.prompt_tokens + entry.completion_tokens     │
│ 3. commitUsageFact() per entry                                  │
│ 4. Log metric: external_billing.reconcile_success               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Provider-Specific Details

### LangGraph Server (LiteLLM) — MVP

| Aspect            | Value                                    |
| ----------------- | ---------------------------------------- |
| Billing source    | LiteLLM `/spend/logs` API                |
| Correlation field | `end_user` (set via `configurable.user`) |
| Call ID field     | `spend_logs.request_id`                  |
| ExecutorType      | `langgraph_server`                       |
| SourceSystem      | `litellm`                                |

**Validated:** `initChatModel({ configurableFields: ["model", "user"] })` propagates `configurable.user` to OpenAI `user` field → LiteLLM `end_user`.

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
- [x] Provider sets `configurable.user = ${runId}/${attempt}` server-side
- [x] Validated: `end_user` populated in LiteLLM spend_logs
- [ ] Add `getSpendLogsByEndUser(endUser)` to LiteLLM adapter
- [ ] Create `reconcileRun()` in `external-reconciler.ts`
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

| Anti-Pattern                    | Why Forbidden                              |
| ------------------------------- | ------------------------------------------ |
| Trust client-supplied `user`    | Billing spoofing                           |
| Query by `metadata.runId`       | LiteLLM doesn't support metadata filtering |
| Stream events as billing source | Unreliable, may drop                       |
| Skip `attempt` in correlation   | Retries create duplicates                  |
| Direct charge_receipts mutation | Violates ONE_LEDGER_WRITER                 |

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

**Last Updated**: 2026-01-29
**Status**: Validated (end_user correlation proven in spend_logs)
