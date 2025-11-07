# tests/unit/features · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Unit tests for use cases that orchestrate business logic via mocked ports.

## Pointers

- [Features source](../../../src/features/)
- [Test fakes](../../_fakes/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["src/features", "src/core", "src/ports"],
  "must_not_import": ["src/adapters", "src/app"]
}
```

## Public Surface

- **Exports:** none
- **Routes:** none
- **CLI:** `pnpm test tests/unit/features`
- **Env/Config keys:** none
- **Files considered API:** none

## Responsibilities

- This directory **does:** test use case logic with mocked port dependencies
- This directory **does not:** test real adapters or UI interactions

## Standards

- Mock all port dependencies using test fakes
- No I/O, no time, no RNG
