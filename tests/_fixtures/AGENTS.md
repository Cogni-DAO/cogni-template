# tests/\_fixtures · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Static test data for consistent test scenarios across unit and integration tests.

## Pointers

- [Unit tests](../unit/)
- [Integration tests](../integration/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": [],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Exports:** JSON data files
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** all .json files

## Responsibilities

- This directory **does:** provide consistent test data for reproducible tests
- This directory **does not:** contain logic or executable code

## Standards

- JSON only, no executable code
- Keep data realistic but minimal
