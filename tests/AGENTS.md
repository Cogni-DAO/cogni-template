# tests · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Status:** draft

## Purpose

Unit, integration, and contract tests including setup and test utilities.

## Pointers

- [Root AGENTS.md](../AGENTS.md)
- [Architecture](../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["*"],
  "must_not_import": []
}
```

## Public Surface

- **Exports:** Test utilities, mocks, setup functions
- **Routes (if any):** none
- **CLI (if any):** pnpm test, vitest commands
- **Env/Config keys:** Test-specific environment variables
- **Files considered API:** setup.ts, test utilities

## Ports (optional)

- **Uses ports:** All ports (for testing)
- **Implements ports:** Mock implementations
- **Contracts (required if implementing):** Contract test harnesses

## Responsibilities

- This directory **does**: Test core rules, features with mocked ports, adapter integration
- This directory **does not**: Contain production code, UI components

## Usage

Minimal local commands:

```bash
pnpm test
vitest run
```

## Standards

- Unit tests for core and features
- Contract tests for all port implementations

## Dependencies

- **Internal:** All layers for testing
- **External:** vitest, testing utilities

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Mock adapters for deterministic testing
