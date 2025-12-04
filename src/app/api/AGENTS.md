# api · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-12-05
- **Status:** draft

## Purpose

HTTP API endpoints using Next.js App Router. Contract-validated entry points that delegate to feature services.

## Pointers

- [App AGENTS.md](../AGENTS.md)
- [Architecture](../../../docs/ARCHITECTURE.md)
- [Feature Development Guide](../../../docs/FEATURE_DEVELOPMENT_GUIDE.md)

## Boundaries

```json
{
  "layer": "app",
  "may_import": ["features", "contracts", "shared"],
  "must_not_import": [
    "adapters/server",
    "adapters/worker",
    "core",
    "ports",
    "components"
  ]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):**
  - `/api/auth/[...nextauth]` [GET, POST]
  - `/api/v1/ai/completion` [POST]
  - `/api/v1/activity` [GET]
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** v1/_/route.ts, admin/_/route.ts

## Ports (optional)

- **Uses ports:** none directly (features use ports)
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: validate HTTP requests/responses with contracts; delegate to features
- This directory **does not**: contain business logic, direct port usage, or data transformations

## Usage

```bash
curl http://localhost:3000/api/v1/ai/completion
```

## Standards

- All routes must validate with contract schemas
- Parse input before processing, parse output before responding
- Use NextResponse for consistent HTTP responses

## Dependencies

- **Internal:** contracts (for validation), shared (for types)
- **External:** next (NextResponse)

## Change Protocol

- Update this file when **Routes** change
- Bump **Last reviewed** date
- Ensure contract tests pass

## Notes

- v1 API prefix for versioned product routes
