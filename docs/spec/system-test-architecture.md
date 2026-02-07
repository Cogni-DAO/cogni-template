---
id: system-test-architecture-spec
type: spec
title: System Test Architecture
status: draft
spec_state: draft
trust: draft
summary: Design for replacing FakeLlmAdapter with real LiteLLM proxy + mock-openai-api. Stack tests exercise the real proxy path with deterministic mock responses.
read_when: Modifying test infrastructure, LLM adapter wiring, or stack test setup.
implements:
owner: derekg1729
created: 2026-02-06
verified: 2026-02-07
tags: [testing, infrastructure, ai-graphs]
---

# System Test Architecture

## Context

Stack tests currently use `FakeLlmAdapter` which bypasses the entire LiteLLM proxy path. This prevents testing billing integration, tool execution flow, and observability end-to-end. The solution is to route LLM calls through real LiteLLM with a test config pointing to `mock-openai-api`.

## Goal

Deprecate `FakeLlmAdapter` in container wiring so stack tests exercise the real LiteLLM proxy path with deterministic mock responses. No new env vars, no new test tiers. Existing stack tests organically become system integration tests.

## Non-Goals

- Testing with real model weights (use mock-openai-api for determinism)
- Adding new test tiers or env vars for adapter selection
- Modifying `APP_ENV=test` semantics beyond LLM adapter wiring
- Replacing unit-test fakes (`FakeLlmService` in `tests/_fakes/ai/`)

## Core Invariants

1. **REAL_PROXY_MOCK_BACKEND**: `APP_ENV=test` keeps all its current semantics (rate-limit bypass, error rethrowing, secret relaxation). The only change: `container.ts` always wires `LiteLlmAdapter`, never `FakeLlmAdapter`. In test stacks, LiteLLM uses `litellm.test.config.yaml` which routes all models to `mock-openai-api`.

2. **APP_EXECUTES_TOOLS**: LiteLLM is a dumb proxy — it never auto-executes tool calls. Mock-LLM emits `tool_calls` in OpenAI format; the app's `toolRunner.exec()` is the single enforcement point per tool-use spec.

3. **DETERMINISTIC_NO_WEIGHTS**: Mock-LLM returns canned responses. No model weights, no randomness. Tests assert on stable shapes.

4. **ASSERT_ARTIFACTS_NOT_LOGS**: Assert on HTTP response bodies, database rows (`charge_receipts`, `ai_invocation_summaries`), event metadata — never on log output.

5. **UNIT_FAKES_STAY**: `FakeLlmService` (in `tests/_fakes/ai/`) is a unit-test double injected at the port level. It is unaffected. Only the container-wiring adapter (`src/adapters/test/ai/fake-llm.adapter.ts`) is deprecated.

## Design

### LiteLLM Test Config

New file: `platform/infra/services/runtime/configs/litellm.test.config.yaml`

Routes all model requests to `mock-openai-api`. No real provider keys needed.

```yaml
model_list:
  - model_name: mock-local
    litellm_params:
      model: openai/mock-model
      api_base: http://mock-llm:3000
      api_key: "fake-key"

general_settings:
  master_key: "os.environ/LITELLM_MASTER_KEY"
```

### Config Selection via Env Var

Parameterize the LiteLLM config volume mount in `docker-compose.dev.yml`:

```yaml
# Before
- ./configs/litellm.config.yaml:/app/config.yaml:ro

# After
- ./configs/${LITELLM_CONFIG:-litellm.config.yaml}:/app/config.yaml:ro
```

`.env.test` sets `LITELLM_CONFIG=litellm.test.config.yaml`. Dev/prod use the default.

### Mock-LLM Container

Add to `docker-compose.dev.yml`. The `zerob13/mock-openai-api` image is ~50MB, starts in 1-2s, no weights. Default port is 3000.

```yaml
mock-llm:
  image: zerob13/mock-openai-api:latest
  container_name: mock-llm
  networks:
    - cogni-edge
  healthcheck:
    test: ["CMD", "curl", "-sf", "http://127.0.0.1:3000/v1/models"]
    interval: 5s
    timeout: 2s
    retries: 5
```

No `depends_on` from LiteLLM — it's a lazy proxy that doesn't check backends at startup. Mock-llm's 1-2s startup completes well before app readiness (~10-20s). If mock-llm is down, tests get a clear LiteLLM upstream error.

**Network**: `cogni-edge` (same as LiteLLM, so LiteLLM can reach `mock-llm:3000`).

### Deprecate FakeLlmAdapter in Container Wiring

In `src/bootstrap/container.ts:196-198`, remove the `isTestMode` branch for LLM:

```typescript
// Before
const llmService = env.isTestMode ? new FakeLlmAdapter() : new LiteLlmAdapter();

// After
const llmService = new LiteLlmAdapter();
```

In `src/shared/env/invariants.ts:123-130`, `LITELLM_MASTER_KEY` must now be required even in test mode (`.env.test` already has `LITELLM_MASTER_KEY=test-key`).

All other test-mode fakes (metrics, web-search, repo, EVM, onchain verifier) stay as-is.

### What Stays the Same

- `APP_ENV=test` semantics unchanged (rate-limit bypass, error rethrowing, billing rethrow)
- Test tiers unchanged (`test`, `test:int`, `test:stack:docker`, `e2e`)
- `FakeLlmService` (unit test double) unchanged
- Capability fakes (metrics, web-search, repo) unchanged
- `wait-for-probes.ts` unchanged
- vitest configs unchanged

### Anti-Patterns

1. **No new env vars for adapter selection** — `COGNI_LLM_ADAPTER`, `APP_TEST_MODE`, etc. are unnecessary. The LiteLLM config file is the selection mechanism.
2. **No new test tiers** — stack tests are stack tests. They just exercise a real proxy path now.
3. **No LiteLLM auto-tool-execution** — LiteLLM proxies; the app enforces tool policy.
4. **No real model weights in CI** — mock-openai-api returns canned JSON.
5. **No log-based assertions** — assert on DB rows, response metadata, event payloads.

## Acceptance Checks

**Manual:**

1. Stack tests pass with `LITELLM_CONFIG=litellm.test.config.yaml` routing to mock-openai-api
2. No `FakeLlmAdapter` references in `container.ts` wiring
3. `APP_ENV=test` semantics (rate-limit bypass, etc.) still work

## Open Questions

_(None — design is finalized)_

## Related

- [System Test Architecture Initiative](../../work/initiatives/ini.system-test-architecture.md) — implementation roadmap (P0 mock-LLM wiring, P1 new assertions, P2 cleanup)
- [Tool Use](./tool-use.md) — DENY_BY_DEFAULT, toolRunner.exec() enforcement
- [Environments](./environments.md) — stack deployment modes
