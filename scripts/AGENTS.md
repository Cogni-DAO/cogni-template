# scripts · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-19
- **Status:** draft

## Purpose

Build-time scripts for migrations, seeds, type generation, development utilities, database management, and documentation validation.

## Pointers

- [Root AGENTS.md](../AGENTS.md)
- [Architecture](../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "scripts",
  "may_import": ["scripts", "ports", "shared", "types"],
  "must_not_import": [
    "app",
    "features",
    "core",
    "adapters/server",
    "adapters/worker",
    "adapters/cli"
  ]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):** none
- **CLI (if any):** Migration, seed, database drop, and validation commands
- **Env/Config keys:** Database connection, development flags
- **Files considered API:** validate-agents-md.mjs (validation script), db/drop-test-db.ts (test database utility)

## Ports (optional)

- **Uses ports:** Database ports for migrations
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Run migrations, seed data, generate types, development automation, validate AGENTS.md files, manage test databases
- This directory **does not**: Contain runtime code, business logic, UI components

## Usage

Minimal local commands:

```bash
node scripts/migrate.ts
node scripts/seed-db.ts
tsx scripts/db/drop-test-db.ts  # Drop test database (safety-guarded)
pnpm check:agentsmd             # Validate all AGENTS.md files
```

## Standards

- Build-time only execution
- No production dependencies

## Dependencies

- **Internal:** shared/, adapters/, bootstrap/
- **External:** Database clients, development tools

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Scripts must be idempotent and safe to re-run
- AGENTS.md validator enforces hexagonal import standards for AGENTS.md
