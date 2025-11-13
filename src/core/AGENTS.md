# core · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-13
- **Status:** draft

## Purpose

Pure domain logic with entities, rules, and business invariants. No I/O, time, or RNG dependencies.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "core",
  "may_import": ["core"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "adapters/server",
    "adapters/worker",
    "shared"
  ]
}
```

## Public Surface

- **Exports:** Domain entities, business rules, invariants
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** All exported entities and rules

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define domain entities, business rules, validation logic
- This directory **does not**: Perform I/O, access external services, handle UI concerns

## Usage

Minimal local commands:

```bash
pnpm test tests/unit/core/
pnpm typecheck
```

## Standards

- Pure functions only
- Unit tests required for all business rules

## Dependencies

- **Internal:** core/ only
- **External:** None (pure domain logic)

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Inject Clock/Rng via ports for deterministic testing
