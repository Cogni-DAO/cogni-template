# System Test Architecture

> [!CRITICAL]
> Deprecate `FakeLlmAdapter`. In test stacks, LLM calls flow through real LiteLLM with a test config routing to `mock-openai-api`. No new env vars, no new test tiers. Existing stack tests organically become system integration tests.

## Core Invariants

1. **REAL_PROXY_MOCK_BACKEND**: `APP_ENV=test` keeps all its current semantics (rate-limit bypass, error rethrowing, secret relaxation). The only change: `container.ts` always wires `LiteLlmAdapter`, never `FakeLlmAdapter`. In test stacks, LiteLLM uses `litellm.test.config.yaml` which routes all models to `mock-openai-api`.

2. **APP_EXECUTES_TOOLS**: LiteLLM is a dumb proxy — it never auto-executes tool calls. Mock-LLM emits `tool_calls` in OpenAI format; the app's `toolRunner.exec()` is the single enforcement point per `TOOL_USE_SPEC.md`.

3. **DETERMINISTIC_NO_WEIGHTS**: Mock-LLM returns canned responses. No model weights, no randomness. Tests assert on stable shapes.

4. **ASSERT_ARTIFACTS_NOT_LOGS**: Assert on HTTP response bodies, database rows (`charge_receipts`, `ai_invocation_summaries`), event metadata — never on log output.

5. **UNIT_FAKES_STAY**: `FakeLlmService` (in `tests/_fakes/ai/`) is a unit-test double injected at the port level. It is unaffected. Only the container-wiring adapter (`src/adapters/test/ai/fake-llm.adapter.ts`) is deprecated.

---

## What Changes

### 1. LiteLLM Test Config

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

### 2. Config Selection via Env Var

Parameterize the LiteLLM config volume mount in `docker-compose.dev.yml`:

```yaml
# Before
- ./configs/litellm.config.yaml:/app/config.yaml:ro

# After
- ./configs/${LITELLM_CONFIG:-litellm.config.yaml}:/app/config.yaml:ro
```

`.env.test` sets `LITELLM_CONFIG=litellm.test.config.yaml`. Dev/prod use the default.

### 3. Mock-LLM Container

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

### 4. Deprecate FakeLlmAdapter in Container Wiring

In `src/bootstrap/container.ts:196-198`, remove the `isTestMode` branch for LLM:

```typescript
// Before
const llmService = env.isTestMode ? new FakeLlmAdapter() : new LiteLlmAdapter();

// After
const llmService = new LiteLlmAdapter();
```

In `src/shared/env/invariants.ts:123-130`, `LITELLM_MASTER_KEY` must now be required even in test mode (`.env.test` already has `LITELLM_MASTER_KEY=test-key`).

All other test-mode fakes (metrics, web-search, repo, EVM, onchain verifier) stay as-is.

### 5. What Stays the Same

- `APP_ENV=test` semantics unchanged (rate-limit bypass, error rethrowing, billing rethrow)
- Test tiers unchanged (`test`, `test:int`, `test:stack:docker`, `e2e`)
- `FakeLlmService` (unit test double) unchanged
- Capability fakes (metrics, web-search, repo) unchanged
- `wait-for-probes.ts` unchanged
- vitest configs unchanged

---

## Migration: Affected Tests

### Stack tests referencing FakeLlmAdapter (update comments/guards)

These tests guard with `APP_ENV === "test"` (still true) but mention FakeLlmAdapter in error messages. Update messages:

- `tests/stack/ai/billing-e2e.stack.test.ts:42-45`
- `tests/stack/ai/billing-idempotency.stack.test.ts:43-46`
- `tests/stack/internal/graphs-run.stack.test.ts:41`
- `tests/stack/scheduling/scheduler-worker-execution.stack.test.ts:58`
- `tests/stack/meta/metrics-instrumentation.stack.test.ts:209`

### Stack tests asserting `[FAKE_COMPLETION]` content

These assert on FakeLlmAdapter's canned response. Update to assert on mock-openai-api response shape instead (or loosen to assert non-empty content):

- Any test checking `responseData.message.content === "[FAKE_COMPLETION]"`

### Unit tests for FakeLlmAdapter (delete or adapt)

- `tests/unit/adapters/test/ai/fake-llm.adapter.spec.ts` — delete (tests deprecated adapter)
- `tests/unit/bootstrap/container.spec.ts:38-48` — update: assert `LiteLlmAdapter` is wired regardless of `APP_ENV`

### Tests that become unblocked

- `tests/stack/ai/litellm-call-id-mapping.stack.test.ts:42` — currently skipped because FakeLlmAdapter doesn't hit LiteLLM. Can now be enabled.
- `tests/stack/ai/langfuse-observability.stack.test.ts:762-764` — TODO noting real LiteLLM test needed. Can now be addressed.

---

## Implementation Checklist

### P0: Mock-LLM + Deprecate FakeLlmAdapter

- [ ] Create `platform/infra/services/runtime/configs/litellm.test.config.yaml`
- [ ] Parameterize litellm config volume in `docker-compose.dev.yml` via `${LITELLM_CONFIG:-litellm.config.yaml}`
- [ ] Add `LITELLM_CONFIG=litellm.test.config.yaml` to `.env.test`
- [ ] Add `mock-llm` service to `docker-compose.dev.yml` on `cogni-edge` network
- [ ] In `container.ts:196-198`, always use `LiteLlmAdapter` (remove `isTestMode` branch for LLM)
- [ ] In `invariants.ts`, require `LITELLM_MASTER_KEY` in test mode (already set in `.env.test`)
- [ ] Update stack test guard messages (5 files listed above)
- [ ] Update any tests asserting `[FAKE_COMPLETION]`
- [ ] Delete `tests/unit/adapters/test/ai/fake-llm.adapter.spec.ts`
- [ ] Update `tests/unit/bootstrap/container.spec.ts` to expect `LiteLlmAdapter`
- [ ] Update `scripts/check-full.sh` to ensure mock-llm starts with test stack
- [ ] Update `.github/workflows/ci.yaml` stack-test job to set `LITELLM_CONFIG`

### P1: New System Integration Assertions (incremental)

- [ ] Enable `litellm-call-id-mapping.stack.test.ts` (no longer needs FakeLlmAdapter skip)
- [ ] Add tool_call_allowed test: mock-LLM emits tool_call → toolRunner executes → assert `ai_invocation_summaries` row
- [ ] Add tool_call_denied test: mock-LLM emits tool_call for non-allowlisted tool → `policy_denied` → assert no execution artifact
- [ ] Add unknown_tool test: mock-LLM emits unregistered tool ID → guard rejects → deterministic error shape
- [ ] Address langfuse-observability TODO (real LiteLLM integration test)

### P2: Cleanup

- [ ] Deprecation-remove `src/adapters/test/ai/fake-llm.adapter.ts` and its barrel export
- [ ] Update `tests/stack/AGENTS.md` and `tests/_fakes/AGENTS.md` references
- [ ] Update `docs/TESTING.md` to reflect LiteLLM-based test LLM wiring

---

## File Pointers (P0 Scope)

| File                                                               | Change                                            |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| `platform/infra/services/runtime/configs/litellm.test.config.yaml` | New: test-only LiteLLM config routing to mock-llm |
| `platform/infra/services/runtime/docker-compose.dev.yml:92`        | Parameterize litellm config volume mount          |
| `platform/infra/services/runtime/docker-compose.dev.yml`           | Add `mock-llm` service                            |
| `.env.test`                                                        | Add `LITELLM_CONFIG=litellm.test.config.yaml`     |
| `src/bootstrap/container.ts:196-198`                               | Always use `LiteLlmAdapter`                       |
| `src/shared/env/invariants.ts:123-130`                             | Require `LITELLM_MASTER_KEY` in test mode         |
| `scripts/check-full.sh`                                            | Ensure mock-llm + test config in stack startup    |
| `.github/workflows/ci.yaml` (stack-test job)                       | Set `LITELLM_CONFIG` env var                      |

---

## Anti-Patterns

1. **No new env vars for adapter selection** — `COGNI_LLM_ADAPTER`, `APP_TEST_MODE`, etc. are unnecessary. The LiteLLM config file is the selection mechanism.
2. **No new test tiers** — stack tests are stack tests. They just exercise a real proxy path now.
3. **No LiteLLM auto-tool-execution** — LiteLLM proxies; the app enforces tool policy.
4. **No real model weights in CI** — mock-openai-api returns canned JSON.
5. **No log-based assertions** — assert on DB rows, response metadata, event payloads.

---

## Related Docs

- [Testing Strategy](TESTING.md) — APP_ENV=test pattern, adapter wiring
- [Tool Use Spec](TOOL_USE_SPEC.md) — DENY_BY_DEFAULT, toolRunner.exec() enforcement
- [Environments](ENVIRONMENTS.md) — stack deployment modes

---

**Last Updated**: 2026-02-06
**Status**: Draft
