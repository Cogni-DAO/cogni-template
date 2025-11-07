# env · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Single source of truth for environment variables. Validates at load time with Zod. Separates server-only and public client vars.

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

- APP_BASE_URL (url)
- DATABASE_URL
- SESSION_SECRET (≥32 chars)

LLM (Stage 8):

- LITELLM_BASE_URL (url)
- LITELLM_ADMIN_KEY
- OPENROUTER_API_KEY
- DEFAULT_MODEL (default: openrouter/auto)

Optional:

- NODE_ENV (development|test|production, default development)
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
- Vars by layer list above,
- .env.example,
- tests touching env.

Bump Last reviewed date. Ensure pnpm lint && pnpm typecheck pass.

## Notes

- Rotation for SESSION_SECRET can be added later via SESSION_SECRETS CSV
