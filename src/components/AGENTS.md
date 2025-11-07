# components · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Shared presentational UI components and design system implementation.

## Pointers

- [Architecture](../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "components",
  "may_import": ["components", "shared", "types", "styles"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters/server",
    "adapters/worker",
    "contracts",
    "bootstrap"
  ]
}
```

## Public Surface

- **Exports:** UI components, variants, types
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** ui/index.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Provide reusable UI components, handle styling patterns
- This directory **does not**: Contain business logic, side effects, or data fetching

## Usage

Minimal local commands:

```bash
pnpm typecheck
```

## Standards

- Component entry points via index.ts files
- shadcn/ui integration via ui/ subdirectory

## Dependencies

- **Internal:** shared/util, styles/
- **External:** React, Radix UI primitives, class-variance-authority

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint passes

## Notes

- UI components follow shadcn/ui patterns
