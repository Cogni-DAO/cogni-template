# ports · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-07
- **Status:** stable

## Purpose

Define **port interfaces** that the domain depends on and adapters must implement.
Ports describe _what_ the domain needs from external services, not _how_ they work. Includes AccountService with dual-cost LLM billing support.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "ports",
  "may_import": ["ports", "core", "types"],
  "must_not_import": [
    "app",
    "features",
    "adapters/server",
    "adapters/worker",
    "shared"
  ]
}
```

## Public Surface

- **Exports:**
  - AccountService (user-scoped: getOrCreateBillingAccountForUser, getBalance, debitForUsage, creditAccount, recordChargeReceipt, listChargeReceipts, listCreditLedgerEntries, findCreditLedgerEntryByReference)
  - ServiceAccountService (service-role: getBillingAccountById, getOrCreateBillingAccountForUser — BYPASSRLS subset)
  - LlmService (completion, completionStream with CompletionStreamParams including abortSignal, tools, toolChoice; returns providerCostUsd, litellmCallId, toolCalls)
  - AgentCatalogPort (listAgents; discovery-only interface per AGENT_DISCOVERY.md)
  - AgentDescriptor (agentId, graphId, name, description; P0_AGENT_GRAPH_IDENTITY: agentId === graphId)
  - GraphExecutorPort (runGraph → stream + completion promise; execution-only per GRAPH_EXECUTION.md)
  - GraphRunRequest (includes toolIds for per-run tool allowlist; graphId typed as GraphId), GraphRunResult, GraphFinal
  - UsageService (getUsageStats, listUsageLogs; legacy aggregation interface)
  - ActivityUsagePort (getSpendLogs, getSpendChart; LiteLLM-only telemetry for Activity dashboard)
  - UsageLogEntry, UsageLogsByRangeParams (types for log fetching)
  - ChatDeltaEvent (text_delta | error | done)
  - PaymentAttemptUserRepository (create, findById — RLS enforced, UserId bound at construction)
  - PaymentAttemptServiceRepository (findByTxHash, updateStatus, bindTxHash, recordVerificationAttempt, logEvent — BYPASSRLS, billingAccountId defense-in-depth anchor)
  - OnChainVerifier (verify transaction against expected parameters)
  - MetricsQueryPort (queryRange, queryInstant for Prometheus-compatible backends)
  - AiTelemetryPort (recordInvocation for ai_invocation_summaries DB writes)
  - LangfusePort (createTrace, createTraceWithIO, updateTraceOutput, startSpan, recordGeneration, flush for optional Langfuse integration)
  - Clock (now)
  - Port-level errors (InsufficientCreditsPortError, BillingAccountNotFoundPortError, VirtualKeyNotFoundPortError, PaymentAttemptNotFoundPortError, TxHashAlreadyBoundPortError, ActivityUsageUnavailableError)
  - LlmError, LlmErrorKind, isLlmError (typed error classification from status codes)
  - normalizeErrorToExecutionCode (error-to-code normalization, re-exported for adapters)
  - LlmToolDefinition, LlmToolCall, LlmToolChoice (tool calling types)
  - Types (ChargeReceiptParams, ChargeReceiptProvenance, LlmCaller, BillingAccount, CreditLedgerEntry, CreatePaymentAttemptParams, LogPaymentEventParams, VerificationResult, VerificationStatus, CompletionStreamParams)
  - ScheduleControlPort (create/pause/resume/delete schedule lifecycle)
  - ScheduleUserPort (user-facing schedule CRUD, RLS-scoped)
  - ScheduleWorkerPort (worker-only schedule reads/updates, BYPASSRLS)
  - ExecutionGrantUserPort (user-facing grant create/revoke/delete)
  - ExecutionGrantWorkerPort (worker-only grant validation)
  - ExecutionRequestPort (idempotency layer for execution requests)
  - ScheduleRunRepository (run ledger: createRun, markRunStarted, markRunCompleted)
  - SandboxRunnerPort (runOnce; one-shot container execution with optional LLM proxy)
  - SandboxRunSpec, SandboxRunResult, SandboxLlmProxyConfig (sandbox execution types)
  - SandboxProgramContract (stdout JSON envelope for sandbox agent output; matches OpenClaw --json format)
  - Grant errors (GrantNotFoundError, GrantExpiredError, GrantRevokedError, GrantScopeMismatchError)
  - Schedule errors (ScheduleNotFoundError, ScheduleAccessDeniedError, InvalidCronExpressionError, InvalidTimezoneError)
- **Routes:** none
- **CLI:** none
- **Env/Config:** none
- **Files considered API:** all \*.port.ts files

Note: src/ports/** is separate from src/contracts/**.
Ports = internal dependencies; contracts = edge IO (HTTP/MCP).

## Responsibilities

- This directory **does:** Define interfaces for external dependencies (DB, AI, wallet, clock, rng, queues, etc.); Document expectations and invariants for each port (e.g. idempotency, error semantics)
- This directory **does not:** Contain implementations or concrete dependencies; Contain business logic, HTTP handlers, or framework code; Import adapters, features, or delivery layers

## Usage

Each port must have port behavior tests in tests/ports/\*\*

Example: tests/ports/credits.port.spec.ts

Port tests verify that all adapters obey the port's interface and invariants

These tests are separate from edge tests for src/contracts/\*\*

## Standards

- Files are interface-only (interface, type), no classes or side effects
- Port filenames end with .port.ts (e.g. credits.port.ts, clock.port.ts)
- All time and randomness must go through ports (Clock, Rng) to keep domain deterministic

## Dependencies

- **Internal:** src/core
- **External:** none

## Change Protocol

- Update this file when Exports or boundaries change
- Bump Last reviewed date
- Ensure ESLint boundary rules still pass and all tests/ports/\*\* still pass

## Notes

- Port tests are located in tests/ports/\*\* to validate adapter conformance
- Ports define contracts for internal dependencies, separate from external API contracts
- PaymentAttemptUserRepository enforces ownership via RLS (withTenantScope) + billingAccountId filter; PaymentAttemptServiceRepository uses BYPASSRLS with billingAccountId defense-in-depth
- OnChainVerifier is generic (no blockchain-specific types), returns VerificationResult with status (VERIFIED | PENDING | FAILED)
- Port-level errors are thrown by adapters, caught and translated by feature layer
- recordChargeReceipt is non-blocking (never throws InsufficientCredits post-call per ACTIVITY_METRICS.md)
- ActivityUsagePort is for Activity dashboard (distinct from observability/Grafana telemetry); single implementation (LiteLLM) by design; throws ActivityUsageUnavailableError on failures (for 503 mapping)
