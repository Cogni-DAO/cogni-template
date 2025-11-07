# tests/contract · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Reusable contract tests that verify port implementations are swappable.

## Pointers

- [Ports source](../../src/ports/)
- [Test harness](./harness/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["src/ports", "src/core"],
  "must_not_import": ["src/adapters", "src/features", "src/app"]
}
```

## Public Surface

- **Exports:** contract test functions for adapter validation
- **Routes:** none
- **CLI:** imported by integration tests
- **Env/Config keys:** none
- **Files considered API:** `ports/*.contract.ts`

## Responsibilities

- This directory **does:** define expected behavior for port implementations
- This directory **does not:** test specific adapters or business logic

## Standards

- Every port must have a contract test suite
- Adapters run these contracts in integration tests
