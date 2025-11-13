# shared · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-13
- **Status:** draft

## Purpose

Low-level building blocks used across the repo. Primitives and reusable shapes (e.g., walletAddressZ, isoDateZ, paginationZ), DTO mappers, pure utilities. No auth scopes. No rate limits. No operation IDs.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- **Related:** [contracts](../contracts/) (external IO specs), [types](../types/) (compile-time only)

## Boundaries

```json
{
  "layer": "shared",
  "may_import": ["shared"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters/server",
    "adapters/worker"
  ]
}
```

## Public Surface

- **Exports:** DTOs, mappers, constants, utilities, cn function
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** Environment schema definitions
- **Files considered API:** env/index.ts, util/index.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Provide pure utilities, DTOs, constants, environment schemas
- This directory **does not**: Contain business logic, side effects, or framework dependencies

## Usage

Minimal local commands:

```bash
pnpm test tests/unit/shared/
pnpm typecheck
```

## Standards

- Keep small and pure
- Promote growing parts into core or new port
- No versioning policy here; stability comes from the contracts that compose them
- Keep `shared/` small and pure. Promote growing parts into `core` or a new `port`

## Dependencies

- **Internal:** shared/ only
- **External:** zod, clsx, tailwind-merge, utility libraries

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Avoid framework-specific dependencies
