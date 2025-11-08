# styles · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Design system token definitions and TypeScript mirrors for theming.

## Pointers

## Boundaries

```json
{
  "layer": "styles",
  "may_import": ["styles"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters/server",
    "adapters/worker",
    "contracts",
    "bootstrap",
    "shared",
    "components",
    "types"
  ]
}
```

## Public Surface

- **Exports:** Design token name arrays, TypeScript types, CVA styling factories
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** tailwind.preset.ts, ui.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Export token name constants for TypeScript usage, provide CVA styling factories for components
- This directory **does not**: Define token values (CSS is source of truth), contain component logic

## Usage

Minimal local commands:

```bash
pnpm typecheck
```

## Standards

- CSS variables in app/globals.css are source of truth
- TypeScript exports provide names only, not values
- Token names mirror CSS variable naming
- CVA factories use design tokens exclusively - no arbitrary Tailwind values
- All component styling must flow through ui.ts factories

## Dependencies

- **Internal:** none
- **External:** class-variance-authority (for CVA factories)

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Token names must match CSS variables in app/globals.css
- CVA factory changes require updating components that use them

## Notes

- CSS is source of truth for all design token values
- ui.ts is the single source of truth for component styling
- ESLint blocks literal className usage to enforce API discipline
