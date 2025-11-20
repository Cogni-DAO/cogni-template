# env · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-19
- **Status:** draft

## Purpose

Single source of truth for environment variables. Validates at load time with Zod. Separates server-only and public client vars. Includes APP_ENV for adapter selection.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Architecture](../../../docs/ARCHITECTURE.md)

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

- `server.ts`: serverEnv (typed)
- `client.ts`: clientEnv (typed)
- `index.ts`: re-exports + getEnv, requireEnv

**Files considered API:** server.ts, client.ts, index.ts
**Routes/CLI:** none
**Env/Config keys:** defined below

## File Map

- `server.ts` → server-only, private vars. Never import from client code.
- `client.ts` → public, browser-safe vars (NEXT*PUBLIC*\* only).
- `index.ts` → re-exports and tiny helpers.

## Vars by layer

**Server-only (server.ts)**

Required now:

- POSTGRES_USER
- POSTGRES_PASSWORD
- POSTGRES_DB
- DB_HOST (default: localhost)
- DB_PORT (default: 5432)
- TODO: SESSION_SECRET (≥32 chars) - commented out until session management is implemented

Constructed:

- DATABASE*URL (built from POSTGRES*\_ and DB\_\_ components)

LLM (Stage 8):

- LITELLM_BASE_URL (url, auto-detects: localhost:4000 for dev, litellm:4000 for production)
- LITELLM_MASTER_KEY
- OPENROUTER_API_KEY
- DEFAULT_MODEL (default: openrouter/auto)

Optional:

- NODE_ENV (development|test|production, default development)
- APP_ENV (test, optional; triggers fake adapters when set; production guard prevents APP_ENV=test in prod)
- PORT (default 3000)
- PINO_LOG_LEVEL (trace|debug|info|warn|error, default info)

**Public client (client.ts)**

- NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
- NEXT_PUBLIC_CHAIN_ID (number, default 1)

Rule: only NEXT*PUBLIC*\* keys may appear in client.ts.

## Responsibilities

- **Does:** validate env, type outputs, keep server/public split strict.
- **Does not:** read files, start processes, depend on frameworks.

## Usage

Server code:

```typescript
import { serverEnv } from "@shared/env";
```

Client code:

```typescript
import { clientEnv } from "@shared/env";
```

Helpers (rare):

```typescript
import { getEnv, requireEnv } from "@shared/env";
```

## Standards

- Use Zod for all validation.
- No framework-specific imports.
- Do not access process.env outside this module.

## Dependencies

- **External:** zod
- **Internal:** none

## Change Protocol

When adding/removing keys, update:

- schema in server.ts or client.ts,
- buildDatabaseUrl function in @shared/db if DB-related,
- Vars by layer list above,
- .env.example,
- tests touching env.

Bump Last reviewed date. Ensure pnpm lint && pnpm typecheck pass.

## Notes

- SESSION_SECRET rotation can be added later via SESSION_SECRETS CSV when session management is implemented
- LITELLM_BASE_URL automatically detects deployment context (local dev vs Docker network)
