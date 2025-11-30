# ports · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-29
- **Status:** draft

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
  - AccountService (getOrCreateBillingAccountForUser, getBalance, debitForUsage, creditAccount, recordLlmUsage, listCreditLedgerEntries, findCreditLedgerEntryByReference)
  - LlmService (completion with optional providerCostUsd)
  - PaymentAttemptRepository (create, findById, findByTxHash, updateStatus, bindTxHash, recordVerificationAttempt, logEvent)
  - OnChainVerifier (verify transaction against expected parameters)
  - Clock (now)
  - Port-level errors (InsufficientCreditsPortError, BillingAccountNotFoundPortError, VirtualKeyNotFoundPortError, PaymentAttemptNotFoundPortError, TxHashAlreadyBoundPortError)
  - Types (BilledLlmUsageParams, NeedsReviewLlmUsageParams, LlmCaller, BillingAccount, CreditLedgerEntry, CreatePaymentAttemptParams, LogPaymentEventParams, VerificationResult, VerificationStatus)
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
- PaymentAttemptRepository enforces ownership (findById filters by billingAccountId)
- OnChainVerifier is generic (no blockchain-specific types), returns VerificationResult with status (VERIFIED | PENDING | FAILED)
- Port-level errors are thrown by adapters, caught and translated by feature layer
