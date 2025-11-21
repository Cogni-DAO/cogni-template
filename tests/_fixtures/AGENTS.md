# tests/\_fixtures · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-21
- **Status:** draft

## Purpose

Static test data for consistent test scenarios across unit and integration tests.

## Pointers

- [Unit tests](../unit/)
- [Integration tests](../integration/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["shared"],
  "must_not_import": ["adapters", "core", "features", "app", "ports"]
}
```

## Public Surface

- **Exports:** JSON data files, wallet test data (test-data.ts), wallet HTTP helpers (api-helpers.ts)
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** all .json files, wallet/\*.ts

## Responsibilities

- This directory **does:** provide consistent test data for reproducible tests
- This directory **does not:** contain logic or executable code

## Usage

```bash
# Import test data in tests
import proposals from "@tests/_fixtures/proposals.json"
```

## Standards

- Prefer JSON for static data
- TypeScript helpers allowed for DRY test utilities (api-helpers, test constants)
- Keep data realistic but minimal
- No business logic in fixtures

## Dependencies

- **Internal:** none
- **External:** none

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date

## Notes

- Whenever creating a fixture, first grab real data and directly model after it
