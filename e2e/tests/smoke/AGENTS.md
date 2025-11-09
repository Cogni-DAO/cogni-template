# smoke · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-09
- **Status:** draft

## Purpose

Production-safe smoke tests that verify critical functionality without data mutations.

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
- **CLI (if any):** pnpm e2e:smoke, pnpm e2e:prod
- **Env/Config keys:** none
- **Files considered API:** none

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Test prod-safe workflows, UI rendering, accessibility
- This directory **does not**: Mutate data, test write operations, rely on test fixtures

## Usage

Minimal local commands:

```bash
pnpm e2e:smoke  # run smoke tests only
pnpm e2e:prod   # alias for e2e:smoke
```

## Standards

- Read-only operations only
- No test data dependencies
- Fast execution (< 30s total)

## Dependencies

- **Internal:** none
- **External:** playwright, browser automation

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Tests tagged for smoke project in playwright.config.ts
- Must be safe to run against production environments
