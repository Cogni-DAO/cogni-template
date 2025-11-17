# adapters · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** draft

## Purpose

Infrastructure implementations of ports including server/, worker/, cli/, and test/ adapters. No UI.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "adapters",
  "may_import": ["adapters", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** Port implementations for bootstrap injection, database client (db, Database)
- **Routes (if any):** none
- **CLI (if any):** cli/ adapter implementations
- **Env/Config keys:** DATABASE_URL, LITELLM_BASE_URL, LITELLM_MASTER_KEY
- **Files considered API:** Port implementation exports, database client

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** All ports defined in ports/
- **Contracts (required if implementing):** tests/contract/ must pass for all implementations

## Responsibilities

- This directory **does**: Implement ports, handle external services, provide concrete infrastructure
- This directory **does not**: Contain UI, business logic, or framework routing

## Usage

Minimal local commands:

```bash
pnpm test tests/integration/
pnpm test tests/contract/
```

## Standards

- Contract tests required for all port implementations
- Integration tests against real services

## Dependencies

- **Internal:** ports/, shared/
- **External:** drizzle-orm, postgres, langfuse, pino, siwe, viem, litellm

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- No UI components allowed in adapters/
