# accounts · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** draft

## Purpose

Test double implementations of account service ports for isolated testing.

## Pointers

- [AccountService port](../../../ports/accounts.port.ts)
- [Unit test examples](../../../../tests/unit/core/accounts/model.test.ts)

## Boundaries

```json
{
  "layer": "adapters/test",
  "may_import": ["adapters/test", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** FakeAccountService implementation
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** fake-account.adapter.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** AccountService
- **Contracts (required if implementing):** AccountService contract tests pending

## Responsibilities

- This directory **does**: Provide in-memory test doubles with predictable behavior
- This directory **does not**: Persist data or handle real infrastructure

## Usage

Minimal local commands:

```bash
pnpm test tests/unit/
pnpm test tests/contract/
```

## Standards

- Deterministic behavior for test repeatability
- Pre-populated with common test accounts
- No external dependencies

## Dependencies

- **Internal:** ports, shared/util
- **External:** none

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Ensure boundary lint + contract tests pass

## Notes

- Used when APP_ENV=test for integration tests
- Pre-populates accounts for common test API keys
