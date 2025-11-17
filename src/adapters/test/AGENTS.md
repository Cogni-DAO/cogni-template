# test · AGENTS.md

> Scope: this directory only. ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** draft

## Purpose

Deterministic fake implementations of ports for CI and test environments. No external dependencies.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Architecture](../../../docs/ARCHITECTURE.md)
- [Testing Documentation](../../../docs/TESTING.md)

## Boundaries

```json
{
  "layer": "adapters/test",
  "may_import": ["adapters/test", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** Fake adapter implementations for bootstrap injection
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none (deterministic responses only)
- **Files considered API:** index.ts barrel export

## Responsibilities

- This directory **does**: Provide deterministic fake port implementations; enable CI testing without external dependencies
- This directory **does not**: Make external calls; vary responses; contain configuration

## Usage

Used automatically when `APP_ENV=test` via bootstrap container.

```bash
# CI automatically uses fake adapters
APP_ENV=test pnpm test:int
```

## Standards

- All responses must be deterministic
- No external dependencies or network calls
- Must implement same port interfaces as real adapters

## Dependencies

- **Internal:** ports/, shared/
- **External:** none

## Change Protocol

- Update this file when **Exports** or **Implementations** change
- Bump **Last reviewed** date
- Ensure contract tests pass for all fake implementations

## Notes

- Only accessible from bootstrap layer (features/app cannot import test adapters)
- Responses never vary - keeps CI predictable
- Account testing uses mock fixtures in tests/\_fakes instead of adapter implementations
