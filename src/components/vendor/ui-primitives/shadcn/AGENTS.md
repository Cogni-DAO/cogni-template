# components/ui · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

shadcn/ui component implementations with Radix primitives and design system integration.

## Pointers

- [Parent components](../AGENTS.md)

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

- **Exports:** Button, Card components, variants, props types
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** index.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Implement shadcn/ui components with design tokens
- This directory **does not**: Contain custom component logic beyond shadcn patterns

## Usage

Minimal local commands:

```bash
npx shadcn@latest add [component]
```

## Standards

- Follow shadcn/ui component patterns
- Use design tokens from styles/ layer
- Components use cn() utility for class merging

## Dependencies

- **Internal:** shared/util (cn function)
- **External:** React, Radix UI, class-variance-authority, clsx, tailwind-merge

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Components added via shadcn CLI

## Notes

- Components generated via shadcn/ui CLI
