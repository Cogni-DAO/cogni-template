# ai · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-07
- **Status:** stable

## Purpose

Test double implementations of AI service ports for deterministic testing.

## Pointers

- [Real adapters](../../server/ai/)
- [System Test Architecture](../../../../docs/SYSTEM_TEST_ARCHITECTURE.md)

## Boundaries

```json
{
  "layer": "adapters/test",
  "may_import": ["adapters/test", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** FakeWebSearchAdapter implementation
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** fake-web-search.adapter.ts

## Responsibilities

- This directory **does**: Provide predictable web search responses for test environments
- This directory **does not**: Make external API calls or vary behavior

## Usage

```bash
pnpm test tests/unit/
pnpm test tests/integration/
```

## Standards

- Deterministic responses for test repeatability
- No external dependencies or network calls

## Dependencies

- **Internal:** ports
- **External:** none

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Ensure contract tests pass

## Notes

- LLM adapter (FakeLlmAdapter) was removed — test stacks use real LiteLLM with mock-openai-api backend
- See docs/SYSTEM_TEST_ARCHITECTURE.md for details
