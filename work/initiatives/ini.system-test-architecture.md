---
work_item_id: ini.system-test-architecture
work_item_type: initiative
title: System Test Architecture — Mock-LLM + FakeLlmAdapter Deprecation
state: Active
priority: 2
estimate: 3
summary: Replace FakeLlmAdapter with real LiteLLM proxy + mock-openai-api container for system integration tests
outcome: Stack tests exercise real proxy path (LiteLLM → mock-openai-api) instead of in-memory fakes, enabling system integration assertions on billing, tool execution, and observability
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [testing, infrastructure, ai-graphs]
---

# System Test Architecture — Mock-LLM + FakeLlmAdapter Deprecation

> Source: docs/SYSTEM_TEST_ARCHITECTURE.md (roadmap content extracted during docs migration)

## Goal

Deprecate `FakeLlmAdapter` in container wiring. In test stacks, LLM calls flow through real LiteLLM with a test config routing to `mock-openai-api`. No new env vars, no new test tiers. Existing stack tests organically become system integration tests.

## Roadmap

### Crawl (P0) — Mock-LLM + Deprecate FakeLlmAdapter

**Goal:** Wire mock-openai-api container into test stack, deprecate FakeLlmAdapter in container.ts.

| Deliverable                                                              | Status      | Est | Work Item |
| ------------------------------------------------------------------------ | ----------- | --- | --------- |
| Create `litellm.test.config.yaml` routing all models to mock-llm         | Not Started | 1   | —         |
| Parameterize litellm config volume in `docker-compose.dev.yml`           | Not Started | 1   | —         |
| Add `LITELLM_CONFIG=litellm.test.config.yaml` to `.env.test`             | Not Started | 1   | —         |
| Add `mock-llm` service to `docker-compose.dev.yml` on `cogni-edge`       | Not Started | 1   | —         |
| In `container.ts`, always use `LiteLlmAdapter` (remove isTestMode)       | Not Started | 1   | —         |
| In `invariants.ts`, require `LITELLM_MASTER_KEY` in test mode            | Not Started | 1   | —         |
| Update stack test guard messages (5 files)                               | Not Started | 1   | —         |
| Update any tests asserting `[FAKE_COMPLETION]` content                   | Not Started | 1   | —         |
| Delete `tests/unit/adapters/test/ai/fake-llm.adapter.spec.ts`            | Not Started | 1   | —         |
| Update `tests/unit/bootstrap/container.spec.ts` to expect LiteLlmAdapter | Not Started | 1   | —         |
| Update `scripts/check-full.sh` for mock-llm + test config                | Not Started | 1   | —         |
| Update `.github/workflows/ci.yaml` stack-test job to set LITELLM_CONFIG  | Not Started | 1   | —         |

**Config selection via env var:**

```yaml
# docker-compose.dev.yml litellm volume mount:
- ./configs/${LITELLM_CONFIG:-litellm.config.yaml}:/app/config.yaml:ro
```

`.env.test` sets `LITELLM_CONFIG=litellm.test.config.yaml`. Dev/prod use the default.

**Mock-LLM container:**

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

No `depends_on` from LiteLLM — it's a lazy proxy. Mock-llm's 1-2s startup completes before app readiness (~10-20s).

**Container wiring change:**

```typescript
// Before
const llmService = env.isTestMode ? new FakeLlmAdapter() : new LiteLlmAdapter();

// After
const llmService = new LiteLlmAdapter();
```

**Migration — affected tests:**

Stack tests referencing FakeLlmAdapter (update comments/guards):

- `tests/stack/ai/billing-e2e.stack.test.ts:42-45`
- `tests/stack/ai/billing-idempotency.stack.test.ts:43-46`
- `tests/stack/internal/graphs-run.stack.test.ts:41`
- `tests/stack/scheduling/scheduler-worker-execution.stack.test.ts:58`
- `tests/stack/meta/metrics-instrumentation.stack.test.ts:209`

Tests asserting `[FAKE_COMPLETION]` content: update to assert on mock-openai-api response shape.

Unit tests for FakeLlmAdapter:

- `tests/unit/adapters/test/ai/fake-llm.adapter.spec.ts` — delete
- `tests/unit/bootstrap/container.spec.ts:38-48` — update

**File Pointers (P0):**

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

### Walk (P1) — New System Integration Assertions

**Goal:** Leverage real proxy path to test tool execution, billing integration, and observability end-to-end.

| Deliverable                                                                            | Status      | Est | Work Item            |
| -------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Enable `litellm-call-id-mapping.stack.test.ts` (remove skip)                           | Not Started | 1   | (create at P1 start) |
| Tool call allowed test: mock-LLM emits tool_call → toolRunner executes → assert DB row | Not Started | 2   | (create at P1 start) |
| Tool call denied test: non-allowlisted tool → `policy_denied` → no artifact            | Not Started | 2   | (create at P1 start) |
| Unknown tool test: unregistered tool ID → guard rejects → error shape                  | Not Started | 1   | (create at P1 start) |
| Address langfuse-observability TODO (real LiteLLM integration test)                    | Not Started | 2   | (create at P1 start) |

**Tests that become unblocked:**

- `tests/stack/ai/litellm-call-id-mapping.stack.test.ts:42` — currently skipped because FakeLlmAdapter doesn't hit LiteLLM
- `tests/stack/ai/langfuse-observability.stack.test.ts:762-764` — TODO noting real LiteLLM test needed

### Run (P2) — Cleanup

**Goal:** Remove deprecated adapter and update documentation.

| Deliverable                                                       | Status      | Est | Work Item            |
| ----------------------------------------------------------------- | ----------- | --- | -------------------- |
| Deprecation-remove `src/adapters/test/ai/fake-llm.adapter.ts`     | Not Started | 1   | (create at P2 start) |
| Update `tests/stack/AGENTS.md` and `tests/_fakes/AGENTS.md`       | Not Started | 1   | (create at P2 start) |
| Update `docs/TESTING.md` to reflect LiteLLM-based test LLM wiring | Not Started | 1   | (create at P2 start) |

## Constraints

- REAL_PROXY_MOCK_BACKEND: `APP_ENV=test` keeps all its current semantics. Only change: container.ts always wires `LiteLlmAdapter`.
- APP_EXECUTES_TOOLS: LiteLLM is a dumb proxy. Mock-LLM emits `tool_calls`; the app's `toolRunner.exec()` is the enforcement point.
- DETERMINISTIC_NO_WEIGHTS: Mock-LLM returns canned responses. No model weights, no randomness.
- ASSERT_ARTIFACTS_NOT_LOGS: Assert on HTTP response bodies, database rows, event metadata — never on log output.
- UNIT_FAKES_STAY: `FakeLlmService` (unit-test double in `tests/_fakes/ai/`) is unaffected. Only the container-wiring adapter is deprecated.

## Dependencies

- [x] LiteLLM service in test stack (existing)
- [x] Stack test infrastructure (existing)
- [ ] `mock-openai-api` Docker image (`zerob13/mock-openai-api:latest`)

## As-Built Specs

- [System Test Architecture](../../docs/spec/system-test-architecture.md) — invariants, design decisions, anti-patterns

## Design Notes

- `zerob13/mock-openai-api` image is ~50MB, starts in 1-2s, no weights
- Default port is 3000
- Network: `cogni-edge` (same as LiteLLM, so LiteLLM can reach `mock-llm:3000`)
- No `depends_on` from LiteLLM — it's a lazy proxy that doesn't check backends at startup
