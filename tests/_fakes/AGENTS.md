# tests/\_fakes · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
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
  "may_import": ["src/ports"],
  "must_not_import": ["src/adapters", "src/features", "src/core", "src/app"]
}
```

## Public Surface

- **Exports:** fake implementations of ports
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** all fake classes

## Responsibilities

- This directory **does:** provide controllable, deterministic test doubles for ports
- This directory **does not:** perform real I/O or connect to external services

## Standards

- No I/O, no time, no RNG - all controllable
- Minimal and deterministic behavior only
