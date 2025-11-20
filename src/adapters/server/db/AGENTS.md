# db · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** stable

## Purpose

Database client configuration and connection management for PostgreSQL access.

## Pointers

- [Database schema](../../../shared/db/schema.ts)
- [Drizzle configuration](../../../../../drizzle.config.ts)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["adapters/server", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** Database type, db client instance
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** DATABASE_URL
- **Files considered API:** client.ts, Database type

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none (infrastructure utility)
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Provide configured database client for other adapters
- This directory **does not**: Contain business logic or table operations

## Usage

Minimal local commands:

```bash
pnpm test tests/integration/db/
pnpm db:migrate
```

## Standards

- Uses Drizzle ORM for type-safe database access
- Connection pooling and transaction support
- Migration management through Drizzle

## Dependencies

- **Internal:** shared/db (schema)
- **External:** drizzle-orm, postgres

## Change Protocol

- Update this file when **Exports** or **Env/Config** change
- Bump **Last reviewed** date
- Ensure integration tests pass

## Notes

- Contains migration files in migrations/ subdirectory
- Shared by all database adapters (accounts, etc.)
