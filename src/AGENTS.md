# src · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Status:** draft

## Purpose

Next.js application source implementing hexagonal architecture for a fully web3-enclosed, crypto-funded AI application. Contains all layers from delivery to domain.

## Pointers

- [Root AGENTS.md](../AGENTS.md)
- [Architecture](../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "meta",
  "may_import": ["*"],
  "must_not_import": []
}
```

## Public Surface

- **Exports:** Next.js application
- **Routes (if any):** All app routes via app/
- **CLI (if any):** none
- **Env/Config keys:** Via shared/env/ schemas
- **Files considered API:** app/ routes, features/ exports, components/ exports

## Ports (optional)

- **Uses ports:** All ports defined in ports/
- **Implements ports:** Via adapters/
- **Contracts (required if implementing):** tests/contract/ coverage

## Responsibilities

- This directory **does**: Implement hexagonal architecture, provide delivery layer, domain logic, infrastructure
- This directory **does not**: Contain build tools, deployment config, external test utilities

## Usage

Minimal local commands:

```bash
pnpm dev
pnpm build
pnpm typecheck
```

## Standards

- Hexagonal architecture: app → features → ports → core, adapters → ports → core
- Strict layer boundaries enforced via ESLint
- All subdirs have AGENTS.md files

## Dependencies

- **Internal:** Hexagonal layer structure: app/, bootstrap/, features/, ports/, core/, adapters/, shared/
- **External:** Next.js, React, TypeScript, web3 stack, AI stack

## Change Protocol

- Update this file when **Exports** or major structure changes
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Each subdir maintains its own AGENTS.md

## Notes

- Every subdirectory has detailed AGENTS.md with specific layer rules
- Dependencies flow inward per hexagonal architecture principles
