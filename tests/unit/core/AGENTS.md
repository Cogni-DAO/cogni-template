# tests/unit/core · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Unit tests for pure domain logic with no external dependencies.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Architecture](../../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["src/core"],
  "must_not_import": ["src/ports", "src/adapters", "src/features", "src/app"]
}
```

## Public Surface

- **Exports:** none
- **Routes:** none
- **CLI:** `pnpm test tests/unit/core`
- **Env/Config keys:** none
- **Files considered API:** none

## Responsibilities

- This directory **does:** test pure domain entities, rules, and business invariants
- This directory **does not:** test I/O, external services, or cross-layer interactions

## Standards

- No I/O, no time, no RNG
- Test pure functions and business rules only
- Use deterministic inputs and expected outputs
