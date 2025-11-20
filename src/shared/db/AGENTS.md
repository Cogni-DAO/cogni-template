# db · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-19
- **Status:** stable

## Purpose

Database schema definitions and URL construction utilities. Provides framework-agnostic database connection helpers and Drizzle schema definitions.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Database Architecture](../../../docs/DATABASES.md)

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
    "adapters/worker",
    "adapters/cli",
    "mcp"
  ]
}
```

## Public Surface

**Exports:**

- `db-url.ts`: buildDatabaseUrl, DbEnvInput (pure functions and types)
- `schema.ts`: Drizzle schema definitions
- `index.ts`: re-exports all public APIs

**Files considered API:** db-url.ts, schema.ts, index.ts
**Routes/CLI:** none
**Env/Config keys:** none

## Responsibilities

- This directory **does**: provide database URL construction, schema definitions, framework-agnostic database utilities.
- This directory **does not**: handle connections, migrations, or runtime database operations.

## Usage

```typescript
import { buildDatabaseUrl } from "@/shared/db";
import { schema } from "@/shared/db";
```

## Standards

- No framework dependencies (Next.js, Zod prohibited in db-url.ts)
- Pure functions only for URL construction
- Drizzle schema follows project conventions

## Dependencies

- **Internal:** none
- **External:** none (db-url.ts), drizzle-orm (schema.ts)

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Update imports in server.ts and drizzle.config.ts if buildDatabaseUrl signature changes
- Ensure pnpm lint && pnpm typecheck pass

## Notes

- buildDatabaseUrl moved from src/shared/env for clean separation of concerns
- Safe for import by both application runtime and build-time tooling
