# [subdir-name] · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @handle1 @handle2 <!-- ≥1 required -->
- **Last reviewed:** YYYY-MM-DD <!-- YYYY-MM-DD format -->
- **Status:** stable | draft | deprecated

## Purpose

1–2 sentences: what this directory does in the system.

## Pointers

- [Key files/docs](../path): <!-- Insert most relevant key file(s) or documentation links here -->
- [Related ADRs](../../docs/adr/) <!-- optional, add specific ADRs if available -->

## Boundaries

```json
{
  "layer": "...",
  "may_import": [...],
  "must_not_import": [...]
}
```

## Public Surface

- **Exports:** modules/types that other dirs may rely on
- **Routes (if any):**
  - App/pages: `/feature/page`, `/feature/[id]`
  - API: `/api/feature` [GET, POST]
- **CLI (if any):** `pnpm feature:do-thing`
- **Env/Config keys:** `NEXT_PUBLIC_FEATURE_FLAG`, `FEATURE_TIMEOUT_MS` | `none`
- **Files considered API:** [list | `none`]

## Ports (optional)

- **Uses ports:** `AIService`, `CreditsRepo` | `none`
- **Implements ports:** `Telemetry`, `ApiKeyRepo` | `none`
- **Contracts (required if implementing):** `tests/contract/<port>.contract.ts`

## Responsibilities

- This directory **does**: …
- This directory **does not**: …

## Usage

Minimal local commands:

```bash
pnpm test -w path/to/this
pnpm build -w path/to/this
```

## Standards

- Overrides to global coding/style rules (only if needed)
- Test expectations (e.g., unit required; contract tests if implementing a port)

## Dependencies

- **Internal:** imports within repo (paths)
- **External:** NPM packages/services

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- TODOs, caveats, "do not edit generated files," migrations
