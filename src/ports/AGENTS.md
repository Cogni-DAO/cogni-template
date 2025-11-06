# ports · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Status:** draft

## Purpose

Contracts and interfaces only. Defines minimal interfaces that adapters implement and features use.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "ports",
  "may_import": ["core"],
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

- **Exports:** Interface definitions, contracts
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** All \*.port.ts files

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** Contract tests in tests/contract/

## Responsibilities

- This directory **does**: Define contracts, specify interfaces, document port requirements
- This directory **does not**: Contain implementations, business logic, or concrete dependencies

## Usage

Minimal local commands:

```bash
pnpm typecheck
pnpm lint
```

## Standards

- Interface-only files
- Each port must have corresponding contract test

## Dependencies

- **Internal:** core/
- **External:** None (pure interfaces)

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- All adapters must implement these interfaces
- Inject `Clock` and `Rng` via ports to keep domain deterministic
