# accounts · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-28
- **Status:** draft

## Purpose

PostgreSQL implementations of account service ports for credit accounting operations with dual-cost LLM billing support (tracks both provider cost and user price).

## Pointers

- [AccountService port](../../../ports/accounts.port.ts)
- [Database schema](../../../shared/db/schema.ts)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["adapters/server", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** DrizzleAccountService implementation
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** DATABASE_URL
- **Files considered API:** drizzle.adapter.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** AccountService
- **Contracts (required if implementing):** AccountService contract tests pending

## Responsibilities

- This directory **does**: Implement AccountService using PostgreSQL via Drizzle ORM; atomic recordLlmUsage with billing status discrimination (billed vs needs_review); transaction rollback on insufficient credits; virtual key provisioning via LiteLLM API
- This directory **does not**: Handle business logic or authentication; compute pricing (uses pre-calculated values from features layer); validate markup invariants

## Usage

Minimal local commands:

```bash
pnpm test tests/integration/
```

## Standards

- All credit operations must use database transactions
- Atomic operations prevent race conditions
- Transaction rollback on insufficient credits

## Dependencies

- **Internal:** ports, shared/db, shared/util
- **External:** drizzle-orm

## Change Protocol

- Update this file when **Exports** or **Env/Config** change
- Bump **Last reviewed** date
- Ensure boundary lint + contract tests pass

## Notes

- Implements ledger-based accounting with computed balance cache
- Transaction semantics critical for credit integrity
- recordLlmUsage branches on billingStatus: "billed" debits credits, "needs_review" records usage only
- Supports nullable cost fields in llm_usage table for graceful degradation when provider cost unavailable
