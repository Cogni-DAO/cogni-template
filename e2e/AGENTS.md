# e2e · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Status:** draft

## Purpose

End-to-end Playwright tests for API routes and UI workflows.

## Pointers

- [Root AGENTS.md](../AGENTS.md)
- [Architecture](../docs/ARCHITECTURE.md)

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
- **CLI (if any):** pnpm e2e, playwright commands
- **Env/Config keys:** Test URLs, browser config
- **Files considered API:** none

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Test end-to-end user workflows via browser automation
- This directory **does not**: Import internal code, contain production logic

## Usage

Minimal local commands:

```bash
pnpm e2e
playwright test
```

## Standards

- Black-box testing only
- Tests against deployed application

## Dependencies

- **Internal:** none
- **External:** playwright, browser automation

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Tests must not depend on internal implementation details
