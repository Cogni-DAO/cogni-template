# bootstrap · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Status:** draft

## Purpose

Composition root for dependency injection, environment configuration, and application bootstrap. Exports container/getPort() for wiring adapters to ports.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "bootstrap",
  "may_import": [
    "bootstrap",
    "ports",
    "adapters/server",
    "adapters/worker",
    "adapters/cli",
    "shared",
    "types"
  ],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** container.ts, config.ts
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** All environment variables via Zod validation
- **Files considered API:** container.ts, config.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Wire adapters to ports, validate environment variables, provide DI container
- This directory **does not**: Contain business logic, UI components, or feature-specific code

## Usage

Minimal local commands:

```bash
pnpm typecheck
pnpm lint
```

## Standards

- Zod-validated environment variables
- No business logic - pure composition

## Dependencies

- **Internal:** adapters/, ports/, shared/
- **External:** zod

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Bootstrap order: config → adapters → ports → container
