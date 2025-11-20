# tests/\_fakes · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** draft

## Purpose

Deterministic test doubles for unit tests with no I/O dependencies.

## Pointers

- [Unit tests](../unit/)
- [Ports source](../../src/ports/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["ports"],
  "must_not_import": [
    "adapters/server",
    "adapters/worker",
    "features",
    "core",
    "app"
  ]
}
```

## Public Surface

- **Exports:** fake implementations and mock fixtures of ports including accounts, AI, telemetry
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** all fake classes

## Responsibilities

- This directory **does:** provide controllable, deterministic test doubles for ports
- This directory **does not:** perform real I/O or connect to external services

## Usage

```bash
# Import in unit tests
import { FakeClock, FakeRng, FakeTelemetry } from "@tests/_fakes"
import { createMockAccountServiceWithDefaults } from "@tests/_fakes"
```

## Standards

- No I/O, no time, no RNG - all controllable
- Minimal and deterministic behavior only

## Dependencies

- **Internal:** none
- **External:** none

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed

## Notes

- Keep fakes minimal and deterministic only
