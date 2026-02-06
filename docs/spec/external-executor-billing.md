---
id: external-executor-billing-spec
type: spec
title: External Executor Billing Design
status: active
spec_state: draft
trust: draft
summary: Async reconciliation billing for external executors via provider billing APIs, correlated by end_user = runId/attempt.
read_when: Working with external executor billing, LiteLLM spend logs, reconciliation, or adding a new executor type.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [billing, ai-graphs]
---

# External Executor Billing Design

## Context

> [!CRITICAL]
> External executors use **async reconciliation** via provider billing APIs. Correlation key is `end_user = ${runId}/${attempt}` (server-set, never client-supplied). Reconcilers call `commitUsageFact()` per LLM call with `usageUnitId = provider_call_id`.

External executors (LangGraph Server, future n8n/Flowise) run LLM calls outside the main app process, so billing cannot be captured in real-time. Instead, the system queries provider billing APIs after execution completes and reconciles usage into the credit ledger.

The `end_user` correlation mechanism has been validated: `initChatModel({ configurableFields: ["model", "user"] })` propagates `configurable.user` to the OpenAI `user` field, which LiteLLM stores as `end_user` in spend_logs.

## Goal

Provide reliable, idempotent billing for LLM calls made by external executors, using provider billing APIs as the authoritative source and server-controlled correlation keys to prevent billing spoofing.

## Non-Goals

- Real-time billing capture for external executors (that's for in-process adapters only)
- Client-side usage tracking (stream events are UX-only, never authoritative)
- Direct charge_receipts DB writes (always through `commitUsageFact()`)

## Core Invariants

1. **END_USER_CORRELATION**: LLM calls set `user = ${runId}/${attempt}` server-side via `configurable.user`. LiteLLM stores this as `end_user`. Reconciler queries `GET /spend/logs?end_user=...`.

2. **USAGE_UNIT_IS_PROVIDER_CALL_ID**: Each LLM call has a unique `usageUnitId = spend_logs.request_id`. Multiple charge_receipts per run is expected for multi-step graphs.

3. **SERVER_SETS_USER_NEVER_CLIENT**: Provider passes `configurable.user` server-side. Client-supplied `user` in configurable is ignored/overwritten. This prevents billing spoofing.

4. **RECONCILE_AFTER_STREAM_COMPLETES**: Reconciliation triggers after stream ends (success or error). No grace window for MVP — LiteLLM writes are synchronous with response.

5. **STREAM_EVENTS_ARE_UX_ONLY**: `usage_report` events from external executors are telemetry hints. Authoritative billing flows through reconciliation only.

6. **ONE_LEDGER_WRITER_PRESERVED**: Reconcilers call `commitUsageFact()` → `recordChargeReceipt()`. Never direct DB writes.

7. **IDEMPOTENCY_VIA_SOURCE_REFERENCE**: `source_reference = ${runId}/${attempt}/${provider_call_id}`. Replayed reconciliation is no-op.

## Design

### Reconciliation Flow

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

### Provider-Specific Details

#### LangGraph Server (LiteLLM) — MVP

| Aspect            | Value                                    |
| ----------------- | ---------------------------------------- |
| Billing source    | LiteLLM `/spend/logs` API                |
| Correlation field | `end_user` (set via `configurable.user`) |
| Call ID field     | `spend_logs.request_id`                  |
| ExecutorType      | `langgraph_server`                       |
| SourceSystem      | `litellm`                                |

**Validated:** `initChatModel({ configurableFields: ["model", "user"] })` propagates `configurable.user` to OpenAI `user` field → LiteLLM `end_user`.

#### Claude SDK — P2

| Aspect         | Value                        |
| -------------- | ---------------------------- |
| Billing source | `message.usage` (in-process) |
| Call ID field  | `message.id`                 |
| ExecutorType   | `claude_sdk`                 |
| SourceSystem   | `anthropic_sdk`              |

Decision pending: If SDK runs in-process, use real-time capture (no reconciliation). If external, same pattern with Anthropic usage API.

#### n8n / Flowise — Future

Must route LLM calls through our LiteLLM instance. Same `end_user` correlation pattern applies.

### Anti-Patterns

| Anti-Pattern                    | Why Forbidden                              |
| ------------------------------- | ------------------------------------------ |
| Trust client-supplied `user`    | Billing spoofing                           |
| Query by `metadata.runId`       | LiteLLM doesn't support metadata filtering |
| Stream events as billing source | Unreliable, may drop                       |
| Skip `attempt` in correlation   | Retries create duplicates                  |
| Direct charge_receipts mutation | Violates ONE_LEDGER_WRITER                 |

### New Executor Integration Checklist

Any new executor must answer:

1. **Authoritative billing source?** (API endpoint or in-process capture)
2. **Correlation key we control?** (e.g., `end_user`, `metadata`, header)
3. **Provider call ID for usageUnitId?** (unique per LLM call)
4. **Idempotent flow through commitUsageFact?** (source_reference format)

### Implementation Status

Correlation mechanism validated (P0 partial):

- `initChatModel` includes `"user"` in `configurableFields`
- Provider sets `configurable.user = ${runId}/${attempt}` server-side
- `end_user` confirmed populated in LiteLLM spend_logs

Remaining P0: `getSpendLogsByEndUser()` adapter method, `reconcileRun()` service, wiring after stream completes, stack test.

### File Pointers

| File                                                       | Role                                      |
| ---------------------------------------------------------- | ----------------------------------------- |
| `packages/langgraph-graphs/src/graphs/*/server.ts`         | `configurableFields: ["model", "user"]`   |
| `src/adapters/server/ai/langgraph/dev/provider.ts`         | `configurable.user = ${runId}/${attempt}` |
| `src/adapters/server/ai/litellm.activity-usage.adapter.ts` | LiteLLM spend logs adapter                |
| `src/features/ai/services/external-reconciler.ts`          | Reconciler service (WIP)                  |

## Acceptance Checks

**Automated:**

- Stack test: chat via external executor → charge_receipts created via reconciliation
- Idempotency test: replayed reconciliation produces no duplicate ledger entries

**Manual:**

1. Verify `end_user` populated in LiteLLM spend_logs after a LangGraph Server run
2. Verify stream `usage_report` events do not create charge_receipts (UX-only)

## Open Questions

_(none — P1 hardening (alerts, retry, metrics) and future provider integrations tracked in ini.payments-enhancements.md)_

## Related

- [Billing Evolution](./billing-evolution.md) — Charge receipt schema
- [AI Architecture and Evals](./ai-evals.md) — Executor types
