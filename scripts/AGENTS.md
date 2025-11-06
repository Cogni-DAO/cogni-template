# scripts · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Reviewed in PR:** TBD
- **Status:** draft

## Purpose

Build-time scripts for migrations, seeds, type generation, and development utilities.

## Pointers

- [Root AGENTS.md](../AGENTS.md)
- [Architecture](../docs/ARCHITECTURE.md)

## Boundaries

**Validated by:** `eslint-plugin-boundaries` (or `import/no-restricted-paths`).  
**Machine-readable boundary spec (required):**

```json
{
  "layer": "scripts",
  "may_import": ["shared", "adapters/server"],
  "must_not_import": ["app", "features", "core", "ports"]
}
```

- **Layer:** scripts
- **May import:** shared, adapters, bootstrap
- **Must not import:** app, features, core, ports

## Public Surface

- **Exports:** none
- **Routes (if any):** none
- **CLI (if any):** Migration and seed commands
- **Env/Config keys:** Database connection, development flags
- **Files considered API:** none

## Ports (optional)

- **Uses ports:** Database ports for migrations
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Run migrations, seed data, generate types, development automation
- This directory **does not**: Contain runtime code, business logic, UI components

## Usage

Minimal local commands:

```bash
node scripts/migrate.ts
node scripts/seed-db.ts
```

## Standards

- Build-time only execution
- No production dependencies

## Dependencies

- **Internal:** shared/, adapters/, bootstrap/
- **External:** Database clients, development tools

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** and set **Reviewed in PR: #<num>**
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Scripts must be idempotent and safe to re-run
