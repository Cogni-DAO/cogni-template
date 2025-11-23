# app · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-11-23
- **Status:** draft

## Purpose

Next.js App Router delivery layer. UI pages and API routes that expose features to external clients.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- [Feature Development Guide](../../docs/FEATURE_DEVELOPMENT_GUIDE.md)

## Boundaries

```json
{
  "layer": "app",
  "may_import": [
    "app",
    "features",
    "ports",
    "shared",
    "contracts",
    "types",
    "components",
    "styles"
  ],
  "must_not_import": ["adapters/server", "adapters/worker", "core"]
}
```

## Public Surface

- **Exports:** none
- **Route Groups:**
  - `(public)`: Unauthenticated pages (landing, marketing, docs)
  - `(app)`: Protected pages requiring authentication (chat, billing, etc.)
  - `(infra)`: Infrastructure endpoints (health, meta, openapi)
  - `api`: Versioned JSON APIs (v1, v2, etc.)
- **Routes (if any):**
  - Public pages: `/` (homepage via `(public)/page.tsx`)
  - Protected pages: `/chat` (via `(app)/chat/page.tsx`)
  - Infra: `/health`, `/openapi.json`, `/meta/route-manifest` (via `(infra)/*`)
  - API: `/api/auth/*`, `/api/v1/ai/completion`
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** layout.tsx, page.tsx, api/\*\*/route.ts, (infra)/\*\*/route.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: expose UI pages and HTTP endpoints; validate requests with contracts
- This directory **does not**: contain business logic, port implementations, or direct database access

## Usage

```bash
pnpm dev     # start dev server
pnpm build   # build for production
```

## Standards

- API routes must validate input/output with contracts
- UI pages use features and components only
- No business logic in routes or pages

## Route Group Conventions

- **`(public)/*`**: Unauthenticated UI pages. No auth guard. Landing page, marketing, docs.
- **`(app)/*`**: Protected UI pages. Auth enforced by `(app)/layout.tsx` using client-side `useSession()` redirect. All pages under `(app)` automatically require authentication. Do NOT add per-page auth checks.
- **`(infra)/*`**: Infrastructure endpoints. Explicitly unauthenticated. Health checks, meta, OpenAPI specs.
- **`api/*`**: JSON APIs. Keep under `api/v1/**` for versioned endpoints. Auth enforced per-route using `auth()` calls in route handlers (not via layout).

When adding new protected pages (e.g., `/billing`, `/api-keys`), place them under `(app)/*` and rely on the layout's auth guard. When adding new APIs, keep them under `api/v1/**` and add explicit `auth()` checks in route handlers.

## Dependencies

- **Internal:** features, contracts, shared, components
- **External:** next, react

## Change Protocol

- Update this file when **Routes** change
- Bump **Last reviewed** date
- Ensure contract validation passes

## Notes

- Uses Next.js App Router patterns
- API routes are thin adapters that delegate to features
