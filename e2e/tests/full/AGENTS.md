# full · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-09
- **Status:** draft

## Purpose

Staging-only tests including write operations and complex workflows.

## Pointers

- [E2E AGENTS.md](../../AGENTS.md)
- [Playwright Config](../../../playwright.config.ts)

## Boundaries

```json
{
  "layer": "e2e",
  "may_import": ["*"],
  "must_not_import": []
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):** Tests all routes externally
- **CLI (if any):** pnpm e2e
- **Env/Config keys:** none
- **Files considered API:** none

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Test full user journeys, write operations, complex flows
- This directory **does not**: Run against production, contain production logic

## Usage

Minimal local commands:

```bash
pnpm e2e        # run full tests only
```

## Standards

- Write operations allowed
- Test fixtures and seeding permitted
- Full user journey coverage expected

## Dependencies

- **Internal:** none
- **External:** playwright, browser automation

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Tests excluded from smoke project in playwright.config.ts
- Safe for staging environments only
