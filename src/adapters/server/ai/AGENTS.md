# ai · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-17
- **Status:** stable

## Purpose

LiteLLM service implementations for AI completion operations.

## Pointers

- [LlmService port](../../../ports/llm.port.ts)
- [LiteLLM configuration](../../../../../platform/infra/services/litellm/)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["adapters/server", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** LiteLlmAdapter implementation
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** LITELLM_BASE_URL, LITELLM_MASTER_KEY, DEFAULT_MODEL
- **Files considered API:** litellm.adapter.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** LlmService
- **Contracts (required if implementing):** LlmService contract tests in tests/contract/

## Responsibilities

- This directory **does**: Implement LlmService using LiteLLM proxy for AI completions
- This directory **does not**: Handle authentication, rate limiting, or timestamps

## Usage

Minimal local commands:

```bash
pnpm test tests/integration/ai/
```

## Standards

- Never logs prompts or API keys for security
- Enforces request timeouts
- Handles provider-specific response formatting

## Dependencies

- **Internal:** ports, shared/env
- **External:** LiteLLM service (external HTTP API)

## Change Protocol

- Update this file when **Exports** or **Env/Config** change
- Bump **Last reviewed** date
- Ensure boundary lint + contract tests pass

## Notes

- Used in production for real LLM completions
- Connects to LiteLLM proxy service for provider abstraction
