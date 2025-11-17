# accounts · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** draft

## Purpose

Account management feature providing admin operations for API key registration, credit top-up, and account validation. Translates domain errors to feature boundaries.

## Pointers

- [AccountService port](../../ports/accounts.port.ts)
- [Core accounts domain](../../core/accounts/)
- [Admin endpoint contracts](../../contracts/admin.accounts.*.contract.ts)

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["features", "ports", "core", "shared", "types"],
  "must_not_import": [
    "app",
    "adapters/server",
    "adapters/worker",
    "bootstrap",
    "contracts"
  ]
}
```

## Public Surface

- **Exports:** registerAccount, topupCredits, getAccountForApiKey services; AccountsFeatureError types
- **Routes (if any):** none (consumed by app layer)
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** services/adminAccounts.ts, errors.ts

## Ports (optional)

- **Uses ports:** AccountService
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Orchestrate admin account operations, translate domain/port errors to feature errors, provide Result-based APIs
- This directory **does not**: Handle HTTP concerns, authenticate requests, persist data directly

## Usage

Minimal local commands:

```bash
pnpm test tests/unit/features/accounts/
pnpm typecheck
```

## Standards

- All service functions return Result types (`{ ok: true, data }` or `{ ok: false, error }`)
- Error translation from domain/port errors to AccountsFeatureError
- Unit tests with mocked ports required

## Dependencies

- **Internal:** ports/accounts, core/accounts, shared/util
- **External:** none

## Change Protocol

- Update this file when **Exports** or service signatures change
- Bump **Last reviewed** date
- Update dependent facades when Result types change
- Ensure boundary lint + unit tests pass

## Notes

- Feature services use Result pattern to avoid throwing across feature boundaries
- Error translation provides stable feature-level error contracts to app layer
