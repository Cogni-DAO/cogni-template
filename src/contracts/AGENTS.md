# contracts · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-11-21
- **Status:** draft

## Purpose

Single source of truth for externally callable operations. Each file defines an operation contract: stable id, Zod input/output, scopes, and versioning. No business logic.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- **Related:** [shared/schemas](../shared/) (reusable primitives), [types](../types/) (compile-time only)

## Boundaries

```json
{
  "layer": "contracts",
  "may_import": ["shared", "types"],
  "must_not_import": [
    "app",
    "features",
    "adapters/server",
    "adapters/worker",
    "core",
    "ports"
  ]
}
```

## Public Surface

- **Exports:** ai.completion.v1, meta.health.read.v1, meta.route-manifest.read.v1; http/router.v1.ts (ts-rest contracts); http/openapi.v1.ts (OpenAPI generation)
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** \*.contract.ts, http/router.v1.ts, http/openapi.v1.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** n/a

## Responsibilities

- This directory **does**: define operation IO and policy; version contracts; enable generation later.
- This directory **does not**: contain domain rules, persistence, or transport code.

## Usage

```bash
pnpm -w lint
pnpm -w typecheck
```

## Standards

- Zod schemas only; export Input/Output TS types via z.infer.
- Contract IDs are namespaced and versioned, e.g. `ai.completion.v1`, `admin.accounts.register.v1`.
- Breaking changes require new version suffix.

## Dependencies

- **Internal:** shared/schemas (primitives), types/
- **External:** zod, @ts-rest/core, @ts-rest/open-api

## Change Protocol

- On shape change: bump id version, update tests, mark **Reviewed in PR**.
- Keep old versions until callers migrate.

## Notes

- HTTP layer (http/) contains ts-rest router and OpenAPI generation from protocol-neutral contracts.
- Protocol-neutral contracts enable both HTTP (ts-rest) and MCP tool generation.
