# ai · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** stable

## Purpose

Test double implementations of AI service ports for deterministic testing.

## Pointers

- [LlmService port](../../../ports/llm.port.ts)
- [Real LiteLLM adapter](../../server/ai/litellm.adapter.ts)

## Boundaries

```json
{
  "layer": "adapters/test",
  "may_import": ["adapters/test", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** FakeLlmAdapter implementation
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** fake-llm.adapter.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** LlmService
- **Contracts (required if implementing):** LlmService contract tests in tests/contract/

## Responsibilities

- This directory **does**: Provide predictable LLM responses for test environments
- This directory **does not**: Make external API calls or vary behavior

## Usage

Minimal local commands:

```bash
pnpm test tests/unit/
pnpm test tests/integration/
```

## Standards

- Deterministic responses for test repeatability
- No external dependencies or network calls
- Fixed "[FAKE_COMPLETION]" response content

## Dependencies

- **Internal:** ports
- **External:** none

## Change Protocol

- Update this file when **Exports** change
- Bump **Last reviewed** date
- Ensure contract tests pass

## Notes

- Used when APP_ENV=test for integration tests
- Always returns predictable responses for CI stability
