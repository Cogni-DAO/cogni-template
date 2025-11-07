# tests/contract/harness · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** stable

## Purpose

Shared helpers to spin up and tear down resources for contract and adapter tests. Minimal, deterministic, no production deps.

## Pointers

- [Contract suites](../ports/)
- [Integration tests](../../integration/)
- [Architecture](../../../docs/ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": ["tests", "ports", "shared"],
  "must_not_import": ["app", "features", "core", "mcp"]
}
```

## Public Surface

- **Exports:** makeHarness, dispose, lightweight stubs (e.g., LLM HTTP stub)
- **Routes:** none
- **CLI:** `pnpm test`
- **Env/Config keys:** none
- **Files considered API:** `factory.ts`, `types.ts`

## Responsibilities

- This directory **does:** provide temp dirs, local stubs, and cleanup hooks
- This directory **does not:** define business logic or test routes/UI

## Usage

```bash
# in adapter specs
import { makeHarness, dispose } from '../contract/harness/factory'
```

## Standards

- Deterministic outputs. No real external calls
- Centralize teardown to prevent leaks
- Keep stubs tiny; move complex fakes next to the adapter under test

## Dependencies

- **Internal:** tests/contract/ports/**, src/ports/**
- **External:** node:http only (MVP)

## Change Protocol

- Update this file if exported helpers change
- Bump **Last reviewed** date

## Notes

- Keep harness utilities minimal and reusable
- Focus on setup/teardown automation for contract tests
