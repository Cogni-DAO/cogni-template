# ai · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-08
- **Status:** stable

## Purpose

LiteLLM service implementations for AI completion, streaming, and usage telemetry operations.

## Pointers

- [LlmService port](../../../ports/llm.port.ts)
- [UsageTelemetryPort](../../../ports/usage.port.ts)
- [LiteLLM configuration](../../../../../platform/infra/services/litellm/)
- [Activity Metrics Design](../../../../docs/ACTIVITY_METRICS.md)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["adapters/server", "ports", "shared", "types"],
  "must_not_import": ["app", "features", "core"]
}
```

## Public Surface

- **Exports:** LiteLlmAdapter (LlmService), LiteLlmUsageAdapter (UsageTelemetryPort), LiteLlmUsageServiceAdapter (UsageService)
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** LITELLM_BASE_URL, LITELLM_MASTER_KEY (model param required - no env fallback)
- **Files considered API:** litellm.adapter.ts, litellm.usage.adapter.ts, litellm.usage-service.adapter.ts
- **Streaming:** completionStream() supports SSE streaming via eventsource-parser with robustness against malformed chunks

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** LlmService, UsageTelemetryPort, UsageService
- **Contracts (required if implementing):** LlmService contract tests in tests/contract/, usage adapter tests in tests/unit/adapters/

## Responsibilities

- This directory **does**: Implement LlmService for AI completions and streaming; implement UsageTelemetryPort for LiteLLM usage telemetry (read-only); implement UsageService adapter mapping telemetry to usage stats
- This directory **does not**: Handle authentication, rate limiting, timestamps, or write charge receipts to DB

## Usage

Minimal local commands:

```bash
pnpm test tests/integration/ai/
```

## Standards

- Never logs prompts or API keys for security
- Enforces 15s connect timeout for streaming (fetch TTFB only)
- Handles provider-specific response formatting
- Streaming malformed SSE chunks logged as warnings without failing stream
- Promise settlement guaranteed exactly once via defer helper
- Usage telemetry: bounded pagination (MAX_PAGES=10, limit≤100), pass-through data from LiteLLM (no local recomputation)
- Usage adapter throws UsageTelemetryUnavailableError on LiteLLM failures (never silent degradation)

## Dependencies

- **Internal:** ports, shared/env, shared/observability/logging
- **External:** LiteLLM service (external HTTP API), eventsource-parser (npm)

## Change Protocol

- Update this file when **Exports** or **Env/Config** change
- Bump **Last reviewed** date
- Ensure boundary lint + contract tests pass

## Notes

- Used in production for real LLM completions
- Connects to LiteLLM proxy service for provider abstraction
