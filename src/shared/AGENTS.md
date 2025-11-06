# shared · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Reviewed in PR:** TBD
- **Status:** draft

## Purpose

Small, pure, framework-agnostic utilities including env/, schemas/, constants/, and util/.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)

## Boundaries

**Validated by:** `eslint-plugin-boundaries` (or `import/no-restricted-paths`).  
**Machine-readable boundary spec (required):**

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

- **Layer:** shared
- **May import:** shared only
- **Must not import:** app, features, ports, core, adapters

## Public Surface

- **Exports:** DTOs, mappers, constants, utilities
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** Environment schema definitions
- **Files considered API:** All exported utilities and schemas

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

## Dependencies

- **Internal:** shared/ only
- **External:** zod, utility libraries only

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** and set **Reviewed in PR: #<num>**
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Avoid framework-specific dependencies
