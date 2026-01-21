# Repository State Summary

**Assessment Date:** 2026-01-20
**Core Mission:** Crypto-metered AI infrastructure where users pay DAO wallet → get credits → consume LLM → billing tracked with dual-cost accounting. Empowering both System-tenant governance AI runs, and user-tenant useful AI services.

**Related Documentation:**

- [Architecture](./ARCHITECTURE.md) - Directory structure and file locations
- [Accounts Design](./ACCOUNTS_DESIGN.md) - Identity & billing model
- [Security & Auth Spec](./SECURITY_AUTH_SPEC.md) - SIWE authentication architecture
- [Payments Design](./PAYMENTS_DESIGN.md) - Native USDC payment architecture
- [Billing Evolution](./BILLING_EVOLUTION.md) - Dual-cost accounting implementation
- [Activity Metrics](./ACTIVITY_METRICS.md) - Usage dashboard and charge receipt design
- [On-Chain Readers](./ONCHAIN_READERS.md) - Treasury snapshots and token ownership intelligence (v2/v3)
- [Chain Configuration](./CHAIN_CONFIG.md) - Policy for binding Web2 code to DAO-approved actions
- [Observability](./OBSERVABILITY.md) - Logging and monitoring infrastructure
- [AI Governance Data](./AI_GOVERNANCE_DATA.md) - Signal ingest, brief generation, incident-gated governance

### Spec Implementation Priority

| Priority | Spec                                                   | Status        | Enables                                                    |
| -------- | ------------------------------------------------------ | ------------- | ---------------------------------------------------------- |
| **1**    | [Scheduler Spec](./SCHEDULER_SPEC.md)                  | 🔄 P1 Pending | Scheduled graph execution, Temporal migration              |
| **2**    | [Graph Execution](./GRAPH_EXECUTION.md)                | 🔄 P1 Pending | Core execution envelope, billing, compiled exports         |
| **3**    | [System Tenant Design](./SYSTEM_TENANT_DESIGN.md)      | 📋 Draft      | Governance loops, PolicyResolverPort, multi-tenancy        |
| **4**    | [Tool Use Spec](./TOOL_USE_SPEC.md)                    | 🔄 70% Done   | Wire adapters, policy enforcement, idempotency             |
| **5**    | [Human-in-the-Loop](./HUMAN_IN_THE_LOOP.md)            | 📋 Draft      | Interrupt/resume, approval gates                           |
| **6**    | [AI Governance Data](./AI_GOVERNANCE_DATA.md)          | 📋 Draft      | Signal ingest, brief generation, incident-gated governance |
| **7**    | [LangGraph Server](./LANGGRAPH_SERVER.md)              | 📋 Contract   | Server deployment mode (P1 for scale)                      |
| **8**    | [Accounts Design](./ACCOUNTS_DESIGN.md) (App API Keys) | 📋 Roadmap    | Per-user API keys, per-key spend attribution               |

**Legend:** 📋 Draft/Contract | 🔄 In Progress | ✅ Complete

### Overall Assessment

| Area                     | Status | Notes                                                                                                        |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------------ |
| Payment + Billing Loop   | 80%    | Flow works with real RPC verification. Needs comprehensive smoke/integration/e2e tests of payments + RPC     |
| Web2 Security            | 70%    | **EVM RPC verification implemented**, needs monitoring & smoke tests                                         |
| Web3 Governance          | 30%    | `repoSpec.server.ts` enforces repo-spec. Needs hardening. External services required (git-review, git-admin) |
| External API Readiness   | 30%    | Service-auth only, API keys on roadmap                                                                       |
| Observability            | 70%    | User Activity dashboard complete, need Admin Grafana metrics dashboards                                      |
| AI Infrastructure Wiring | 50%    | Code docs, logs MCP server. Missing: Langfuse, Evals, LangGraph, assistant-ui/CopilotKit tool use rendering  |
| AI Intelligence          | 10%    | Simple system prompt, no tool usage, no workflows                                                            |
| Company Automations      | 40%    | Thick CI/CD test infra foundation. No automated data analysis, coding, or AI actions                         |

The system accepts USDC payments with real EVM RPC verification, tracks LLM costs with profit margins, and provides full activity visibility. Service-auth architecture means all LLM calls use shared master key (per-user keys on roadmap). AI infrastructure is basic (streaming chat only), automation is primarily CI/CD gates with no autonomous agents yet.

---

## ✅ What's COMPLETE (Code Exists & Working)

### 1. Authentication Infrastructure ✅

Auth.js + SIWE wallet-first authentication with session management. Sessions resolve to billing accounts.

**Reference:** [SECURITY_AUTH_SPEC.md](./SECURITY_AUTH_SPEC.md)

### 2. Wallet Integration ✅

wagmi + RainbowKit client-side wallet connection. Chain locked to Base mainnet (8453).

**Reference:** [INTEGRATION_WALLETS_CREDITS.md](./INTEGRATION_WALLETS_CREDITS.md)

### 3. Native USDC Payments ✅

x
Intent-based payment flow: create intent → user transfers USDC → submit txHash → verify → credit account.

- State machine: `CREATED_INTENT` → `PENDING_UNVERIFIED` → `CREDITED` (+ terminal: `REJECTED`, `FAILED`)
- Two-port design: `PaymentAttemptRepository` + `OnChainVerifier`
- Idempotency enforced at DB level

**Security Note:**: EvmRpcOnChainVerifierAdapter implemented with viem RPC verification. Validates transactions against canonical config (chain, recipient, token, amount).\*\*

**Reference:** [PAYMENTS_DESIGN.md](./PAYMENTS_DESIGN.md)

### 4. Database Schema (Billing Layer) ✅

Tables: `users`, `billing_accounts`, `virtual_keys`, `credit_ledger`, `charge_receipts`, `payment_intents`, `payment_attempts`, `payment_events`

**Architecture:** Service-auth model where `virtual_keys` acts as FK/scope handle for billing attribution. All outbound LLM calls use `LITELLM_MASTER_KEY` from env.

**Reference:** [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md), [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md)

### 5. Dual-Cost LLM Billing ✅

Provider cost tracking + user pricing with configurable profit margin (default 2.0×).

- LiteLLM provides cost → full billing with margin enforcement
- Cost header missing → graceful degradation (free response, logged for review)
- Invariant: `user_price_credits >= provider_cost_credits` when billed

**Reference:** [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md)

### 6. Credits Page UI ✅

Balance display + native USDC payment flow. Live data with React Query cache invalidation.

### 7. AI Chat Interface ✅

assistant-ui powered streaming chat with credit-metered billing.

### 8. Activity Dashboard ✅

Full usage tracking dashboard with LiteLLM integration.

- `/api/v1/activity` endpoint with LiteLLM `/spend/logs` integration
- Time-range selector with bounded range-scan
- Aggregation by hour/day/week/month
- USD cost display from charge receipts
- Join key: `litellm_call_id` links telemetry to billing

**Reference:** [ACTIVITY_METRICS.md](./ACTIVITY_METRICS.md)

### 9. Observability Infrastructure ✅

Pino structured logging → Alloy → local Loki (dev) or Grafana Cloud (preview/prod).

Prometheus metrics export with HTTP and LLM instrumentation.

**Reference:** [OBSERVABILITY.md](./OBSERVABILITY.md)

### 10. Generic Charge Ledger ✅

Charge receipts support categorization beyond LLM charges:

- `charge_reason` field for economic/billing categories
- `source_system` + `source_reference` for generic linking to external systems
- Supports future integration with Stripe, payment processors, etc.

**Reference:** src/shared/db/schema.billing.ts:133-137

---

## ⚠️ What's PARTIALLY COMPLETE (Code Exists, Needs Work)

### 11. Runtime Secret Validation ⚠️

- ✅ `LITELLM_MASTER_KEY` validation deferred to runtime (enables `next build` without secrets)
- ✅ `assertRuntimeSecrets()` called at adapter boundaries
- ⚠️ Memoization in production only (test env re-validates each call)

**Reference:** src/shared/env/invariants.ts

---

## ❌ What's NOT STARTED

### 12. App API Key Management (Roadmap) ❌

**Current State (Service-Auth MVP):**

- ✅ Auth.js session-only auth for `/api/v1/*`
- ✅ Outbound LLM calls use service auth (`LITELLM_MASTER_KEY`)
- ✅ `virtual_keys` table exists as internal FK/scope handle for ledger/receipts
- ❌ No per-user API keys
- ❌ No per-key spend attribution
- ❌ No user-facing key management endpoints

**Roadmap (Target System):**

Per-user API keys with 1:1 LiteLLM virtual key mapping for per-key spend attribution.

- Add `app_api_keys` table (hash-only, show-once plaintext)
- Add `app_api_key_id` FK to `credit_ledger` and `charge_receipts`
- Add endpoints: `POST /api/v1/keys`, `GET /api/v1/keys`, `DELETE /api/v1/keys/:id`
- Add auth middleware: `/api/v1/*` accepts session OR `Authorization: Bearer <app_api_key>`
- Update LLM port: resolve `{billing_account_id, app_api_key_id}` → mapped LiteLLM virtual key

**Reference:** [ACCOUNTS_API_KEY_ENDPOINTS.md](./ACCOUNTS_API_KEY_ENDPOINTS.md) - Full spec (not implemented), [ACCOUNTS_DESIGN.md](./ACCOUNTS_DESIGN.md), [SECURITY_AUTH_SPEC.md](./SECURITY_AUTH_SPEC.md)

### 13. Post-MVP Security Hardening ⚠️

**Current Trust Model:**

- ✅ SIWE-authenticated session resolves billing account
- ✅ Payment flow structure in place (intent → submit → verify)
- ✅ **EvmRpcOnChainVerifierAdapter implemented** - Real viem RPC verification with canonical config validation
- ✅ Wired in DI container for all non-test environments
- ⚠️ Needs comprehensive smoke tests against known-good transactions

**Security Status:** Backend performs cryptographic verification via EVM RPC. Validates chain, recipient, token, amount, and confirmations.

**Remaining for Production Hardening - See [PAYMENTS_DESIGN.md Phase 3](./PAYMENTS_DESIGN.md#phase-3-evm-rpc-verification-next---direct-rpc-with-viem):**

- [ ] Add smoke tests against known-good txs on Sepolia/Base
- [ ] Validate all failure modes in integration tests
- [ ] Monitoring and alerting for verification failures
- [ ] Rate limiting on RPC calls to prevent cost spikes

### 14. Operational Hardening ❌

- [ ] Rate limiting on payment and AI endpoints (public routes have basic rate limiting)
- [ ] Monitoring dashboards (Grafana)
- [ ] Runbooks for common scenarios

### 15. Route Protection & Cleanup ❌

- [ ] Add middleware for route protection (currently using layout guards only)
- [ ] Comprehensive API authentication tests
- [ ] Security audit of auth flow

---

## 💰 Current Economics

- 1 credit = $0.001 USD
- 1 USDC = 1,000 credits
- Default markup: 2.0× (50% profit margin)

**Payment Flow:** User creates intent → transfers USDC to DAO wallet → submits txHash → backend verifies (stubbed) → credits account

**Reference:** [BILLING_EVOLUTION.md](./BILLING_EVOLUTION.md) - Credit Unit Standard

---

## 🎯 Summary

### ✅ Working

- Auth.js + SIWE wallet authentication
- Native USDC payment flow (stubbed verification)
- Credits ledger and balance updates
- Dual-cost LLM billing with profit margin enforcement
- AI chat with assistant-ui
- Activity dashboard with LiteLLM integration
- Structured logging → Grafana Cloud
- Prometheus metrics export

### ⚠️ Partial

- Runtime secret validation (works, test memoization edge case)

### ❌ Not Started (Critical for Production)

- App API key management (roadmap)
- Rate limiting & monitoring dashboards
- Comprehensive payment verification smoke tests
