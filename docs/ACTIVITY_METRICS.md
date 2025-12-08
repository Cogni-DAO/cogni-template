# Activity Metrics Design

> [!CRITICAL]
> LiteLLM is the canonical source for usage telemetry (model, tokens, timestamps).
> Our DB stores only charge receipts for billing audit.
> User-visible spend = `charged_credits` (our billing with markup), NOT LiteLLM's `spend`.

---

## Core Invariants

1. **Preflight-only gating**: Estimate cost vs available credits _before_ calling LiteLLM. Once a call starts, never block or revoke it due to post-call cost.

2. **LiteLLM is canonical (no shadow metering)**: LiteLLM is the sole source of usage telemetry. No local token/model/provider recomputation.

3. **Minimal charge_receipt**: Audit-focused table with only: `request_id`, `billing_account_id`, `litellm_call_id`, `charged_credits`, `response_cost_usd`, `provenance`, `created_at`. No model/tokens/usage JSONB.

4. **Activity reads from LiteLLM (hard dependency)**: Dashboard uses `/spend/logs` as the ONLY source for telemetry. If LiteLLM is unavailable, return 503 and show explicit error state.

5. **User-visible spend = our billing**: Dashboard displays `charged_credits` (our billed amount with markup), not raw provider costs from LiteLLM.

6. **Idempotent receipts with ledger pairing**: Every charge_receipt row is keyed by `request_id`. Each receipt maps 1:1 to a `credit_ledger` debit entry.

7. **No fallback**: If LiteLLM is down, fail loudly (503), don't show partial data.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ ACTIVITY DASHBOARD                                                  │
│ ─────────────────                                                   │
│ Telemetry (model, tokens, timestamps) → LiteLLM /spend/logs         │
│ Spend (what we charged user)          → llm_usage.charged_credits   │
│ Join key: litellm_call_id                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### System of Record

| Data Type                       | Canonical Source    | Our DB Role           |
| ------------------------------- | ------------------- | --------------------- |
| Usage telemetry (model, tokens) | LiteLLM spend logs  | None (query upstream) |
| Credit entitlements             | credit_ledger table | Authoritative         |
| Charge receipts                 | llm_usage table     | Immutable audit trail |

---

## Key Files

| File                                                                   | Purpose                                     |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| `src/adapters/server/ai/litellm.activity-usage.adapter.ts`             | Read-only adapter for LiteLLM `/spend/logs` |
| `src/shared/schemas/litellm.spend-logs.schema.ts`                      | Zod schemas for LiteLLM response validation |
| `src/ports/usage.port.ts`                                              | ActivityUsagePort interface                 |
| `src/features/ai/services/activity.ts`                                 | Activity service (aggregation logic)        |
| `src/app/_facades/ai/activity.server.ts`                               | Facade: joins LiteLLM telemetry + receipts  |
| `src/contracts/ai.activity.v1.contract.ts`                             | API contract schemas                        |
| `src/adapters/server/accounts/drizzle.adapter.ts`                      | `listChargeReceipts()` for spend join       |
| `tests/unit/adapters/server/ai/litellm.activity-usage.adapter.spec.ts` | Unit tests for adapter                      |

---

## LiteLLM `/spend/logs` API Behavior

**Critical quirk:** Response format changes based on query params.

| Query Params                                        | Response Format                 |
| --------------------------------------------------- | ------------------------------- |
| `end_user` + `limit` only                           | Array of individual log entries |
| `end_user` + `start_date` + `end_date` + `group_by` | Array of aggregated buckets     |

**Individual logs** (for Activity table):

```typescript
// DO NOT pass start_date/end_date - triggers aggregate mode
url.searchParams.set("end_user", billingAccountId);
url.searchParams.set("limit", "100");
```

**Aggregated buckets** (for Activity chart):

```typescript
url.searchParams.set("end_user", billingAccountId);
url.searchParams.set("start_date", "2025-01-01");
url.searchParams.set("end_date", "2025-01-08");
url.searchParams.set("group_by", "day");
```

---

## Activity Dashboard Join

The facade joins two data sources:

1. **LiteLLM telemetry** → model, tokens, timestamps, providerCostUsd (observational)
2. **Local charge receipts** → chargedCredits (what we actually billed)

```typescript
// In activity.server.ts
const receipts = await accountService.listChargeReceipts({
  billingAccountId,
  from,
  to,
  limit,
});

// Build join map: litellmCallId → chargedCredits
const chargeMap = new Map<string, string>();
for (const receipt of receipts) {
  if (receipt.litellmCallId) {
    chargeMap.set(receipt.litellmCallId, receipt.chargedCredits);
  }
}

// Join: display chargedCredits, not providerCostUsd
const rows = logs.map((log) => ({
  ...log,
  cost: chargeMap.get(log.callId) ?? "—",
}));
```

---

## Gating Model (Preflight-Only)

```
PREFLIGHT (blocking)
─────────────────────
1. Estimate tokens from message content (approximate)
2. Estimate cost: tokens × blended_rate × markup
3. Check: balance >= estimated_cost
4. ALLOW or DENY (InsufficientCreditsError)
         │
         ▼ (if allowed)
LLM CALL (non-blocking)
───────────────────────
- Call LiteLLM with user=billingAccountId
- Stream response to user (never interrupted)
- Extract x-litellm-response-cost and x-litellm-call-id headers
         │
         ▼
POST-CALL (never blocking)
─────────────────────────
- Derive cost from header or usage.cost
- Write charge_receipt + debit credit_ledger atomically
- If balance goes negative: log critical, DO NOT block response
- InsufficientCreditsError is FORBIDDEN in this phase
```

---

## Cost Derivation Rules

Priority order:

1. **Header present**: Use `x-litellm-response-cost` header value
2. **Usage event present**: Use `usage.cost` from LiteLLM's final usage event
3. **Neither present**: Set `response_cost_usd = null`, log CRITICAL

**Never** derive cost from token counts × model pricing tables.

---

## Error Handling

| Scenario                    | Behavior                                         |
| --------------------------- | ------------------------------------------------ |
| LiteLLM returns 502/503/504 | Throw `ActivityUsageUnavailableError` → HTTP 503 |
| LiteLLM returns 4xx/500     | Throw regular Error → HTTP 500                   |
| Response shape invalid      | Throw `ActivityUsageUnavailableError` → HTTP 503 |
| Network timeout             | Throw `ActivityUsageUnavailableError` → HTTP 503 |

UI shows explicit "Usage unavailable" state. No fallback to local receipts for telemetry.

---

## Known Issues

- [x] **Spend shows provider cost, not user cost.** FIXED: Join receipts by `litellm_call_id`, display `response_cost_usd`.
- [x] **LiteLLM request ID mismatch.** FIXED: Extract `json.id` from response body (gen-... format).
- [x] **Chart tokens/requests show zeros.** FIXED: Aggregate from individual logs, not LiteLLM buckets.
- [x] **Total Spend from receipts.** FIXED: Sum `response_cost_usd` from charge receipts.
- [x] **Old rows show "$—".** Pre-fix rows have UUID in `litellm_call_id`, won't join. Acceptable for MVP.

## TODO

- [ ] **Hourly bucketing.** Currently only day-level aggregation. Need sub-day buckets for "Last Hour" view.
- [ ] **FakeUsageAdapter for stack tests.** Need test double for ActivityUsagePort to avoid LiteLLM dependency in CI.
- [ ] **Stack tests for Activity.** Integration tests for activity endpoint with real data flow.
- [ ] **Table rename.** `llm_usage` → `charge_receipt` (migration needed).

---

## Non-Negotiables

1. **Preflight-only gating** — Never block a response after the LLM call starts
2. **LiteLLM is canonical for telemetry** — No shadow metering, no local token storage
3. **User-visible spend = our billing** — Dashboard shows `charged_credits`, not provider costs
4. **Server controls identity** — `billingAccountId` is server-derived, never client-provided
5. **Idempotent receipts** — `request_id` as PK with 1:1 ledger mapping
6. **No fallback** — If LiteLLM is down, fail loudly (503)
