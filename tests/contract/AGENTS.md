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
  "may_import": ["ports", "core"],
  "must_not_import": ["adapters/server", "adapters/worker", "features", "app"]
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

## Usage

```bash
pnpm test tests/contract
pnpm test tests/contract/ports
```

## Standards

- Every port must have a contract test suite
- Adapters run these contracts in integration tests

## Dependencies

- **Internal:** src/ports, src/core
- **External:** vitest

## Change Protocol

- Update contract tests when port interfaces change
- Bump **Last reviewed** date
- Ensure all adapters pass updated contract suites

## Notes

- Contract tests define the behavioral specification for ports
- Keep contract tests independent of specific adapter implementations
