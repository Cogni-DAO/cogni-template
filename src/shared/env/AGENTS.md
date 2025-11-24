# env · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-21
- **Status:** draft

## Purpose

Single source of truth for environment variables. Lazy validation with Zod prevents build-time access. Separates server-only and public client vars. Includes APP_ENV for adapter selection.

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

- `server.ts`: serverEnv() (unified lazy function)
- `client.ts`: clientEnv (typed object)
- `index.ts`: re-exports + getEnv, requireEnv

**Files considered API:** server.ts, client.ts, index.ts
**Routes/CLI:** none
**Env/Config keys:** defined below

## File Map

- `server.ts` → server-only vars via lazy serverEnv() function. Never import from client code.
- `client.ts` → public, browser-safe vars (NEXT*PUBLIC*\* only).
- `index.ts` → re-exports and tiny helpers.

## Vars by layer

**Server-only (server.ts)**

Unified serverEnv() provides all vars:

- NODE_ENV (development|test|production, default development)
- APP_ENV (test|production)
- POSTGRES_USER
- POSTGRES_PASSWORD
- POSTGRES_DB
- DB_HOST (default: localhost)
- DB_PORT (default: 5432)
- LITELLM_BASE_URL (url, auto-detects: localhost:4000 for dev, litellm:4000 for production)
- LITELLM_MASTER_KEY
- DEFAULT_MODEL (default: openrouter/auto)
- PORT (default 3000)
- PINO_LOG_LEVEL (trace|debug|info|warn|error, default info)

Constructed:

- DATABASE*URL (built from POSTGRES*\_ and DB\_\_ components)

Optional:

- LITELLM_MVP_API_KEY (MVP wallet link single key - TODO: remove when proper wallet→key registry exists)
- OPENROUTER_API_KEY (for LiteLLM providers)
- AUTH_SECRET (≥32 chars) - TODO: when session management added

**Public client (client.ts)**

- NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
- NEXT_PUBLIC_CHAIN_ID (removed; chain is fixed to Base mainnet)

Rule: only NEXT*PUBLIC*\* keys may appear in client.ts.

## Responsibilities

- **Does:** validate env, type outputs, keep server/public split strict.
- **Does not:** read files, start processes, depend on frameworks.

## Usage

Server code:

```typescript
import { serverEnv } from "@shared/env";
const env = serverEnv(); // lazy function call
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

- Lazy serverEnv() function prevents build-time database access
- AUTH_SECRET rotation can be added later via AUTH_SECRETS CSV when session management is implemented
- LITELLM_BASE_URL automatically detects deployment context (local dev vs Docker network)
