# app · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-11-22
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
- **Routes (if any):**
  - App pages: `/` (homepage)
  - Meta: `/health`, `/openapi.json`, `/meta/route-manifest`
  - API: `/api/v1/ai/completion`, `/api/admin/accounts/register-litellm-key`, `/api/admin/accounts/[accountId]/credits/topup`
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** layout.tsx, page.tsx, api/\*\*/route.ts, health/route.ts, openapi.json/route.ts, meta/\*\*/route.ts

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
