# tests/integration · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-07
- **Status:** draft

## Purpose

Verify concrete adapter implementations against real-ish dependencies with minimal mocking. Prefer local containers or official sandbox endpoints. Never production.

## Pointers

- [Adapters source](../../src/adapters/)
- [Port tests](../ports/)

## Boundaries

```json
{
  "layer": "tests",
  "may_import": [
    "adapters/server",
    "adapters/worker",
    "ports",
    "shared",
    "tests"
  ],
  "must_not_import": ["core", "features", "app", "mcp"]
}
```

## Public Surface

- **Exports:** none
- **Routes:** none
- **CLI:** pnpm test:int or vitest run tests/integration
- **Env/Config keys:** .env.test only (e.g., TEST_DB_URL, TEST_LITELLM_URL)
- **Files considered API:** none

## Responsibilities

- This directory **does:** run port test suites against concrete adapters; smoke test infra clients (DB, LLM proxy, wallet verification)
- This directory **does not:** test domain/business logic, UI, or Next routes

## Usage

```bash
pnpm test:int
vitest run tests/integration
pnpm test tests/integration/adapters/ai
```

## Standards

- Adapters must pass their port tests: import tests/ports/\*.port.spec.ts and run the suite
- Dependencies: prefer dockerized locals (postgres, litellm, langfuse). If using third-party, restrict to official sandboxes; forbid production hosts
- Setup/teardown: create and migrate schema per run; isolate data; clean shutdown
- Timing: avoid real time sensitivity; use deterministic inputs; allow retries only for transient network on localhost

## Dependencies

- **Internal:** src/adapters, src/ports, src/shared, tests/ports
- **External:** vitest, docker (for local testing), test environment configs

## Change Protocol

- Update integration tests when adapter implementations change
- Run full port test suites when port interfaces change
- Bump **Last reviewed** date
- Ensure clean test environment setup/teardown

## Notes

- If a spec requires the HTTP boundary, move it to e2e/ (API/UI). Keep this folder adapter-focused
- If an adapter leaks business logic, refactor: rules belong in core or features
