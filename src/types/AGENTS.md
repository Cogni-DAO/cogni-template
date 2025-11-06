# types · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Compile-time only support. TS utility types, branded types, ambient global.d.ts, Env interfaces, conditional types, literal unions. No Zod. No JSON-schema export. Never the source of truth for external IO.

## Pointers

- [Root AGENTS.md](../../AGENTS.md)
- [Architecture](../../docs/ARCHITECTURE.md)
- **Related:** [contracts](../contracts/) (external IO specs), [shared/schemas](../shared/) (runtime primitives)

## Boundaries

```json
{
  "layer": "types",
  "may_import": ["types"],
  "must_not_import": [
    "app",
    "features",
    "adapters/server",
    "adapters/worker",
    "core",
    "ports",
    "contracts",
    "shared"
  ]
}
```

## Public Surface

- **Exports:** TS utility types, branded types, global.d.ts, Env interfaces
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** **/\*.ts, **/\*.d.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** n/a

## Responsibilities

- This directory **does**: provide compile-time type utilities, branded types, ambient declarations
- This directory **does not**: contain Zod schemas, runtime validation, or external IO definitions

## Usage

```bash
pnpm -w typecheck
```

## Standards

- TypeScript types only; no Zod or runtime validation
- Use branded types for domain concepts (e.g., `WalletAddress`, `SessionId`)
- Global ambient types go in `global.d.ts`

## Dependencies

- **Internal:** types/ only (self-contained)
- **External:** none (compile-time only)

## Change Protocol

- Update this file when **Exports** change
- No versioning policy (compile-time only)
- Ensure typecheck passes

## Notes

- Never the source of truth for external IO - use `contracts/` for that
- For runtime primitives, use `shared/schemas/`
