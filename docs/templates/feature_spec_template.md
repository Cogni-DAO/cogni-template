# Activity Metrics Design

> [!CRITICAL]
> LiteLLM is the canonical source for usage telemetry. Our DB stores only charge receipts for billing audit.

## Core Invariants

1. **Preflight-only gating**: Estimate cost vs available credits _before_ calling LiteLLM. Once a call is allowed and a response starts, we never block or revoke it due to post-call usage/cost.

2. **LiteLLM is canonical (no shadow metering)**: LiteLLM is the sole source of usage telemetry (model/provider/tokens/cost). "No shadow metering" means no local token/model/provider recomputation for billing or dashboards—only consume LiteLLM's telemetry as-is.

3. **Minimal charge_receipt**: Audit-focused table with only: `request_id`, `billing_account_id`, `litellm_call_id`, `charged_credits`, `response_cost_usd`, `provenance`, `created_at`. No model/tokens/usage JSONB.

4. **Activity reads from LiteLLM**: Dashboard uses `/spend/logs` as primary source with bounded pagination. Fallback to local receipts only when LiteLLM unavailable, explicitly marked `telemetrySource: "fallback"`.

5. **Streaming doesn't change gating**: We decide once, up front. Post-call cost from LiteLLM is for charging and reconciliation only, never to retroactively deny service.

6. **Idempotent receipts with ledger pairing**: Every charge_receipt row is keyed by `request_id` (idempotent insert). Each receipt maps 1:1 to a `credit_ledger` debit entry. The post-call write must either succeed atomically (transaction) or use idempotent two-step keyed by `request_id`—never partial state.

---

## Implementation Checklist

### P0: Kill Shadow Metering

- [x] Remove post-call blocking: `InsufficientCreditsPortError` is forbidden anywhere in the post-call path, including nested helpers
- [x] Delete custom token-counting code from stream parsing. Only read LiteLLM's own usage payload (`include_usage: true`) as canonical telemetry; no independent token math
- [x] Extract `x-litellm-call-id` header for forensic correlation
- [x] Simplify `llm_usage` schema to charge_receipt columns (drop model/tokens/usage)
- [x] Reshape `recordLlmUsage` port → `recordChargeReceipt` (minimal fields)
- [x] Update activity reads to return `telemetrySource: "fallback"` (prep for P1)
- [ ] Update mocks and tests for new schema (40 type errors remaining)

### P1: Implement LiteLLM Usage Adapter

- [ ] Create `src/adapters/server/ai/litellm.usage.adapter.ts`
- [ ] Chart: `GET /spend/logs?user_id=X&summarize=true` (LiteLLM pre-aggregates)
- [ ] Table: `GET /spend/logs?user_id=X&summarize=false` (paginated, max 100/request)
- [ ] Add bounded pagination (MAX_PAGES=10 circuit breaker)
- [ ] Map LiteLLM log schema → UsageService port types

### P1: Refactor Activity Service

- [ ] Primary/fallback: try LiteLLM adapter, catch → degraded receipts-only
- [ ] Surface `telemetrySource: "litellm" | "fallback"` in contract output

### P2: Long-Term Hedge (Only If Needed)

- [ ] Monitor LiteLLM data retention (check if logs disappear after N days)
- [ ] If retention < 90 days: implement periodic export job
- [ ] **Do NOT build this preemptively**

---

## Design Decisions

### 1. System of Record

| Data Type                                           | Canonical Source     | Our DB Role           |
| --------------------------------------------------- | -------------------- | --------------------- |
| **Usage telemetry** (model, provider, tokens, cost) | LiteLLM spend logs   | None (query upstream) |
| **Credit entitlements**                             | credit_ledger table  | Authoritative         |
| **Charge receipts**                                 | charge_receipt table | Immutable audit trail |

**Rule:** Never store model/provider/tokens in our DB as if they're canonical. Query LiteLLM.

---

### 2. Gating Model (Preflight-Only)

```
┌─────────────────────────────────────────────────────────────────────┐
│ PREFLIGHT (blocking)                                                │
│ ─────────────────────                                               │
│ 1. Estimate tokens from message content (approximate, not stored)   │
│ 2. Estimate cost: tokens × blended_rate × markup                    │
│ 3. Check: balance >= estimated_cost                                 │
│ 4. ALLOW or DENY (InsufficientCreditsError)                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if allowed)
┌─────────────────────────────────────────────────────────────────────┐
│ LLM CALL (non-blocking)                                             │
│ ───────────────────────                                             │
│ - Call LiteLLM with user=billingAccountId                           │
│ - Stream response to user (never interrupted)                       │
│ - Extract x-litellm-response-cost and x-litellm-call-id headers     │
│ - For streams: read final usage event (include_usage: true)         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ POST-CALL (never blocking)                                          │
│ ─────────────────────────                                           │
│ - Derive cost (see Cost Derivation Rules below)                     │
│ - Write charge_receipt + debit credit_ledger atomically             │
│   (transaction or idempotent two-step keyed by request_id)          │
│ - If write fails: log critical, DO NOT block response               │
│ - Overage handled in reconciliation / future rate-limiting          │
│ - InsufficientCreditsError is FORBIDDEN in this phase               │
└─────────────────────────────────────────────────────────────────────┘
```

**Why preflight-only?** Simplicity and user experience. Users should never see a response get cut off mid-stream due to cost overruns. We accept the risk of small overages in exchange for predictable UX.

---

### 3. Cost Derivation Rules

Canonical cost is determined in priority order:

1. **Header present**: Use `x-litellm-response-cost` header value
2. **Usage event present**: Use `usage.cost` from LiteLLM's final usage event (streams with `include_usage: true`)
3. **Neither present**: Set `response_cost_usd = null`, flag row for review (no homegrown cost recomputation)

**Never** derive cost from token counts × model pricing tables. If LiteLLM doesn't provide cost, we don't have cost.

---

### 4. Correlation Strategy

**Identity correlation (ALREADY IMPLEMENTED):**

- We send `user: billingAccountId` (OpenAI API spec field)
- LiteLLM indexes all spend by user_id
- Query: `GET /spend/logs?user_id=<billingAccountId>` returns all activity
- Aggregates across all virtual keys automatically

**Forensic correlation (P0 addition):**

- Capture `x-litellm-call-id` response header
- Store in charge_receipt for dispute/incident correlation
- High forensic value, negligible complexity (nullable field)
- Not used for identity scoping (that's the `user` field)

---

### 5. Charge Receipt Schema (Minimal)

**Allowed columns:**

- `request_id` (text, PRIMARY KEY) - Server-generated UUID, idempotency key
- `billing_account_id` (text, NOT NULL) - Server-controlled identity
- `virtual_key_id` (uuid, NOT NULL) - FK to virtual_keys
- `litellm_call_id` (text, nullable) - Forensic correlation (x-litellm-call-id)
- `charged_credits` (bigint, NOT NULL) - Debited from credit_ledger
- `response_cost_usd` (decimal, nullable) - Observational (see Cost Derivation Rules)
- `provenance` (text, NOT NULL) - `stream` | `response`
- `created_at` (timestamptz, NOT NULL)

**Forbidden columns:**

- model, provider, finish_reason
- prompt_tokens, completion_tokens, total_tokens
- usage (JSONB)
- markup_factor (env constant, not per-row)
- provider_cost_credits (derivable from response_cost_usd)

**Why:** These fields live in LiteLLM. Storing them creates drift and wastes storage.

**Idempotency:** `request_id` as PRIMARY KEY. Use `INSERT ... ON CONFLICT (request_id) DO NOTHING`. Each receipt has exactly one corresponding `credit_ledger` entry with `reference = request_id`.

---

### 6. Read Modes (Activity Dashboard)

**Primary (LiteLLM - P1):**

- **Chart:** `GET /spend/logs?user_id=X&summarize=true` (LiteLLM pre-aggregates by date)
- **Table:** `GET /spend/logs?user_id=X&summarize=false&limit=100` (paginated logs)
- **Pagination:** Bounded fetch (MAX_PAGES=10). Never trust "one query returns everything."

**Fallback (Local - P0):**

- Query charge_receipt for cost + timestamps only
- Return `{ model: "unavailable", tokens: 0, telemetrySource: "fallback" }`
- Explicitly mark degraded state in UI

---

### 7. Streaming Policy

**Parsing:** Read LiteLLM's usage payload from streams (`stream_options: { include_usage: true }`) as canonical telemetry. No custom token counting, no alternate cost math—only consume what LiteLLM provides.

**Non-blocking:** Never interrupt or cancel an in-flight stream because actual cost exceeds preflight estimate. Any overage is handled in billing/reconciliation and future rate limiting, not by blocking the current response.

---

### 8. Reconciliation

- `sum(charge_receipt.response_cost_usd) ≈ sum(litellm.cost)` (±$0.01 per 100 requests)
- `charged_credits = response_cost_usd × MARKUP × CREDITS_PER_USD`
- Discrepancies logged, investigated weekly, reconciled manually if needed

---

## Migration Path

### Phase 1: Validate LiteLLM Correlation (Pre-P0)

1. Query LiteLLM: `GET /spend/logs?user_id=<testBillingAccountId>` manually
2. Verify it returns logs for all requests made with that billingAccountId as `user`
3. Verify spend matches what we charged to credit_ledger
4. **If yes → proceed. If no → investigate.**

### Phase 2: P0 Implementation

1. Schema migration: drop forbidden columns, add litellm_call_id + provenance
2. Update completion service: remove post-call blocking, extract litellm_call_id
3. Update ports: recordLlmUsage → recordChargeReceipt
4. Update activity reads: add telemetrySource="fallback"
5. Deploy, verify no regressions

### Phase 3: P1 Implementation

1. Create LiteLLM usage adapter
2. Wire activity service: primary LiteLLM, fallback local
3. Feature flag rollout, monitor 48 hours
4. Remove flag, LiteLLM is primary

### Phase 4: Cleanup

1. Rename table: llm_usage → charge_receipt (coordinated migration)
2. Archive historical telemetry data (model/tokens) if needed for analytics
3. Update all references

---

## File Pointers (P0 Scope)

| File                                                    | Change                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/shared/db/schema.billing.ts`                       | Drop model/tokens/usage/markup columns, add litellm_call_id + provenance |
| `src/adapters/server/db/migrations/XXXX_*.sql`          | NEW: schema migration                                                    |
| `src/ports/accounts.port.ts`                            | Reshape recordLlmUsage → recordChargeReceipt params                      |
| `src/ports/llm.port.ts`                                 | Add litellmCallId to completion result type                              |
| `src/ports/usage.port.ts`                               | Add telemetrySource to result types                                      |
| `src/adapters/server/ai/litellm.adapter.ts`             | Extract x-litellm-call-id header                                         |
| `src/features/ai/services/completion.ts`                | Remove post-call blocking, pass litellmCallId + provenance               |
| `src/adapters/server/accounts/drizzle.adapter.ts`       | Simplified recording (fewer columns)                                     |
| `src/adapters/server/accounts/drizzle.usage.adapter.ts` | Return telemetrySource="fallback", remove token aggregation              |
| `src/contracts/ai.activity.v1.contract.ts`              | Add telemetrySource to response schema                                   |

---

## Non-Negotiables

1. **Preflight-only gating** - Never block a response after the LLM call starts
2. **LiteLLM is canonical** - No shadow metering, no local token storage
3. **Pagination is mandatory** - Never assume one query returns all data
4. **Fallback is mandatory** - Activity UX must work when LiteLLM is down
5. **Server controls identity** - billingAccountId is server-derived, never client-provided
6. **Idempotent receipts** - request_id as PK with 1:1 ledger mapping, atomic or two-step

---

**Last Updated**: 2025-12-08
**Status**: Design Approved (P0 Ready)
