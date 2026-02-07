# System Test Architecture

> [!CRITICAL]
> CI runs ONE docker stack. System tests exercise the real app→LiteLLM→mock-LLM→toolRunner→policy pipeline with deterministic responses and zero model weights. Adapter selection is decoupled from `APP_ENV` via explicit override env vars (`COGNI_LLM_ADAPTER`, etc.), not a secondary mode variable.

## Core Invariants

1. **SINGLE_STACK**: CI composes up once. All test tiers (component:db, system, browser) run against the same stack or a subset of it. No second compose-up.

2. **ADAPTER_OVERRIDE_NOT_MODE**: Adapter selection uses explicit per-adapter env vars (e.g., `COGNI_LLM_ADAPTER=litellm`), not a compound mode like `APP_TEST_MODE=stack_e2e`. `APP_ENV=test` retains its role: rate-limit bypass, error rethrowing, secret relaxation. Adapter overrides compose independently.

3. **APP_EXECUTES_TOOLS**: The app's tool runner executes tools per its policy. LiteLLM is a dumb proxy — it never auto-executes tool calls. Mock-LLM emits `tool_calls` in OpenAI format; the app decides whether to run them.

4. **DENY_BY_DEFAULT_UNDER_TEST**: System tests validate the `DENY_BY_DEFAULT` tool policy invariant end-to-end. A tool not in the allowlist must produce a `policy_denied` error observable via response metadata or audit row, not a 500.

5. **DETERMINISTIC_NO_WEIGHTS**: The mock-LLM container returns canned responses (including `tool_calls` JSON). No model weights, no randomness. Tests assert on stable response shapes.

6. **ASSERT_ARTIFACTS_NOT_LOGS**: System tests assert on observable artifacts — HTTP response bodies, database rows (`charge_receipts`, `ai_invocation_summaries`), event metadata — never on log output.

7. **NAMES_MATCH_REALITY**: Test script names describe what they test. `test:component:db` = testcontainers Postgres adapter tests. `test:system` = full-stack HTTP-boundary tests. `e2e` = browser-level tests against a composed stack.

---

## Current State (as-built, pre-migration)

### Test Tiers

| Current script      | Vitest config                   | What it actually tests                       | Infra                        |
| ------------------- | ------------------------------- | -------------------------------------------- | ---------------------------- |
| `test`              | `vitest.config.mts`             | Unit + contract (no IO)                      | None                         |
| `test:int`          | `vitest.integration.config.mts` | DB adapter tests via testcontainers Postgres | Docker (ephemeral container) |
| `test:stack:docker` | `vitest.stack.config.mts`       | HTTP API routes against full compose stack   | `docker-compose.dev.yml`     |
| `e2e`               | `playwright.config.ts`          | Browser tests against composed stack         | `docker-compose.dev.yml`     |

### Adapter Wiring (current)

`env.isTestMode` (`src/shared/env/server.ts:189`) gates adapter selection at two levels:

**Container-level** (`src/bootstrap/container.ts:196-246`):

```
APP_ENV=test → FakeLlmAdapter, FakeMetricsAdapter, FakeEvmOnchainClient, FakeOnChainVerifier
```

**Capability-factory-level** (called during tool binding, also keyed on `env.isTestMode`):

```
capabilities/metrics.ts:63-68    → FakeMetricsAdapter
capabilities/web-search.ts:45-50 → FakeWebSearchAdapter
capabilities/repo.ts:62-71       → FakeRepoAdapter
```

**Problem**: Stack tests (`test:stack:docker`) run with `APP_ENV=test`, so they also get `FakeLlmAdapter`. The LLM→tool→policy pipeline is never exercised end-to-end. Unit tests cover `ToolPolicy.decide()` but no test proves the full HTTP→LLM→tool→policy→response chain.

### Coverage Gaps

| Boundary                                                             | Tested? | Where                                                   |
| -------------------------------------------------------------------- | ------- | ------------------------------------------------------- |
| HTTP API → auth gates                                                | Yes     | `tests/stack/auth/*.stack.test.ts`                      |
| HTTP API → FakeLlm → billing                                         | Yes     | `tests/stack/ai/billing-*.stack.test.ts`                |
| HTTP API → real LiteLLM → tool_call → toolRunner → policy → response | **No**  | —                                                       |
| Tool policy DENY_BY_DEFAULT (e2e)                                    | **No**  | Unit only: `tests/unit/features/ai/tool-runner.test.ts` |
| Unknown/unregistered tool rejection (e2e)                            | **No**  | —                                                       |

---

## Design Decisions

### 1. Adapter Override via Env Vars (not compound mode)

**Rejected**: `APP_TEST_MODE=stack_e2e` — creates a taxonomy layer that will sprawl as more adapters need independent override.

**Adopted**: Per-adapter override env vars with `fake` as default (backward-compatible):

| Env var                   | Values                 | Default                      | Wiring location                                         |
| ------------------------- | ---------------------- | ---------------------------- | ------------------------------------------------------- |
| `COGNI_LLM_ADAPTER`       | `fake` \| `litellm`    | `fake` (when `APP_ENV=test`) | `container.ts:196-198`                                  |
| `COGNI_METRICS_ADAPTER`   | `fake` \| `prometheus` | `fake` (when `APP_ENV=test`) | `container.ts:212-246`, `capabilities/metrics.ts:63-68` |
| `COGNI_WEBSEARCH_ADAPTER` | `fake` \| `real`       | `fake` (when `APP_ENV=test`) | `capabilities/web-search.ts:45-50`                      |
| `COGNI_REPO_ADAPTER`      | `fake` \| `real`       | `fake` (when `APP_ENV=test`) | `capabilities/repo.ts:63-71`                            |

**Rules**:

- Override vars are only read when `APP_ENV=test`. In production, real adapters are always used regardless of override vars.
- If override var is unset and `APP_ENV=test`, behavior is identical to today (all fakes). Zero breaking change.
- `env/server.ts` schema adds these as optional enums. `container.ts` reads them.

### 2. Mock-LLM Container

**Choice**: `zerob13/mock-openai-api` (OpenAI-compatible, supports function/tool calling, deterministic, no weights).

**Integration**: Added to `docker-compose.dev.yml` as a new service. LiteLLM config gets a new model entry routing `mock-local` to `http://mock-llm:3000`. The mock server's default port is 3000 (configurable via `PORT` env var).

```yaml
# docker-compose.dev.yml (addition)
mock-llm:
  image: zerob13/mock-openai-api:latest
  container_name: mock-llm
  profiles: [system-test]
  networks:
    - internal
  healthcheck:
    test: ["CMD", "curl", "-sf", "http://127.0.0.1:3000/v1/models"]
    interval: 5s
    timeout: 2s
    retries: 5
```

```yaml
# litellm.config.yaml (addition)
- model_name: mock-local
  litellm_params:
    model: openai/mock-model
    api_base: http://mock-llm:3000
    api_key: "fake-key"
```

**Profile**: `mock-llm` runs under the `system-test` docker-compose profile so it only starts when needed (CI stack-test job, `pnpm docker:test:stack`). Does not affect `pnpm dev:stack`.

### 3. Script Naming

New aliases added alongside existing names (no breaking change):

| New alias           | Points to                                                                        | Old name (kept)     |
| ------------------- | -------------------------------------------------------------------------------- | ------------------- |
| `test:component:db` | Same command as `test:int` (`vitest run --config vitest.integration.config.mts`) | `test:int`          |
| `test:system`       | Same command as `test:stack:docker` (includes DB host overrides + dotenv)        | `test:stack:docker` |

E2e naming deferred — currently `e2e` runs Playwright against local compose, which is technically a local system/browser test. Renaming to `test:browser` or pointing at staging is a separate decision.

### 4. Healthcheck Chain

Stack test setup (`wait-for-probes.ts`) currently gates on app `/livez` + `/readyz`. The existing compose dependency chain is: postgres healthy + litellm healthy + temporal healthy → app starts. Mock-llm is independent — LiteLLM is a lazy proxy that doesn't check backends at startup.

```
mock-llm (healthcheck: /v1/models, starts independently)
litellm (healthcheck: /health/readiness, does NOT depend on mock-llm)
  ↓ depends_on (existing)
app (probes: /livez → /readyz)
  ↓ wait-for-probes.ts
system tests run
```

Mock-llm's startup (~1-2s, no weights) completes well before app readiness (~10-20s). No changes needed to `wait-for-probes.ts` or the existing `depends_on` chain. If mock-llm is unexpectedly slow, tests using `mock-local` model will get a clear LiteLLM upstream error — not a silent failure.

### 5. Parser Tolerance

Mock-LLM may emit tool calls as either `tool_calls` (modern) or `function_call` (legacy). The app's LiteLLM adapter and LangGraph runtime already normalize both formats. System tests accept either shape — they assert on the downstream artifact (tool executed or policy_denied), not on the raw LLM response format.

---

## Implementation Checklist

### P0: Mock-LLM + Adapter Override + 3 System Tests

- [ ] Add `COGNI_LLM_ADAPTER` to `src/shared/env/server.ts` schema (optional enum: `fake` | `litellm`, default behavior unchanged)
- [ ] Update `src/bootstrap/container.ts` LLM wiring to respect `COGNI_LLM_ADAPTER` override when `isTestMode`
- [ ] Add `mock-llm` service to `docker-compose.dev.yml` under `system-test` profile
- [ ] Add `mock-local` model entry to `litellm.config.yaml` routing to `http://mock-llm:3000`
- [ ] Verify `mock-llm` healthcheck passes before system tests run (no `depends_on` needed — LiteLLM is a lazy proxy)
- [ ] Add `test:component:db` and `test:system` aliases to `package.json`
- [ ] Write `tests/stack/ai/system-tool-call-allowed.stack.test.ts`: POST chat with mock-local model → LLM emits tool_call for allowlisted tool → tool executes → final response includes tool result → assert `ai_invocation_summaries` row exists
- [ ] Write `tests/stack/ai/system-tool-call-denied.stack.test.ts`: POST chat with mock-local model → LLM emits tool_call for non-allowlisted tool → policy denies → tool does NOT execute → response contains `policy_denied` → assert no tool execution artifact
- [ ] Write `tests/stack/ai/system-unknown-tool.stack.test.ts`: POST chat with mock-local model → LLM emits tool_call for unregistered tool ID → guard rejects → deterministic error shape in response
- [ ] Update `scripts/check-full.sh` to start `system-test` profile and set `COGNI_LLM_ADAPTER=litellm` for stack test step
- [ ] Update `.github/workflows/ci.yaml` `stack-test` job to activate `system-test` profile and set `COGNI_LLM_ADAPTER=litellm`

#### Chores

- [ ] Update `docs/TESTING.md` to document adapter override pattern and new script aliases
- [ ] Update `AGENTS.md` Usage section with new aliases

### P1: Remaining Adapter Overrides + Capability Expansion

- [ ] Add `COGNI_METRICS_ADAPTER`, `COGNI_WEBSEARCH_ADAPTER`, `COGNI_REPO_ADAPTER` override vars
- [ ] Update capability factories (`capabilities/metrics.ts`, `capabilities/web-search.ts`, `capabilities/repo.ts`) to respect overrides
- [ ] Add system tests for tool capabilities that exercise real (non-fake) capability paths if mock backends exist
- [ ] Evaluate mock backends for metrics/web-search/repo or decide fakes are sufficient for system tier
- [ ] Enable `tests/stack/ai/litellm-call-id-mapping.stack.test.ts` with real LiteLLM adapter (currently skipped; requires non-fake mode to verify `x-litellm-call-id === spend_logs.request_id` invariant)

### P2: E2e Naming + Staging Target (Future)

- [ ] Decide: should `e2e` point at deployed staging or remain local-compose?
- [ ] If staging: update Playwright base URL config; rename current local-compose browser tests to `test:browser`
- [ ] If local-compose stays: rename `e2e` → `test:browser:local` for clarity
- [ ] **Do NOT build this preemptively** — decide when staging deployment is stable

---

## File Pointers (P0 Scope)

| File                                                          | Change                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/shared/env/server.ts`                                    | Add `COGNI_LLM_ADAPTER` optional enum to schema                                                |
| `src/bootstrap/container.ts:196-198`                          | Read `COGNI_LLM_ADAPTER`; use `LiteLlmAdapter` when override is `litellm` even if `isTestMode` |
| `platform/infra/services/runtime/docker-compose.dev.yml`      | Add `mock-llm` service under `system-test` profile                                             |
| `platform/infra/services/runtime/configs/litellm.config.yaml` | Add `mock-local` model entry                                                                   |
| `package.json`                                                | Add `test:component:db` and `test:system` script aliases                                       |
| `scripts/check-full.sh`                                       | Activate `system-test` profile; set `COGNI_LLM_ADAPTER=litellm` for stack step                 |
| `.github/workflows/ci.yaml` (stack-test job)                  | Activate `system-test` profile; set `COGNI_LLM_ADAPTER=litellm`                                |
| `tests/stack/ai/system-tool-call-allowed.stack.test.ts`       | New test: allowlisted tool executes through full pipeline                                      |
| `tests/stack/ai/system-tool-call-denied.stack.test.ts`        | New test: non-allowlisted tool denied by policy                                                |
| `tests/stack/ai/system-unknown-tool.stack.test.ts`            | New test: unregistered tool rejected by guard                                                  |
| `docs/TESTING.md`                                             | Document adapter overrides + new script names                                                  |

---

## Anti-Patterns to Avoid

1. **No compound mode variables** — `APP_TEST_MODE=stack_e2e` creates a matrix of mode × adapter combinations. Use independent adapter overrides.

2. **No LiteLLM auto-tool-execution** — LiteLLM must never execute tools. It is a proxy. The app's `toolRunner.exec()` is the single enforcement point per `TOOL_USE_SPEC.md`.

3. **No log-based assertions** — `expect(logs).toContain("tool executed")` is fragile. Assert on `ai_invocation_summaries` rows, response metadata fields, or event payloads.

4. **No real model weights in CI** — Mock-LLM returns canned JSON. If a test needs specific tool_call shapes, configure mock-LLM's response fixtures, don't reach for a real model.

5. **No double compose-up** — The `integration` CI job uses testcontainers (ephemeral Postgres, no compose). The `stack-test` CI job uses docker-compose. They are separate jobs with separate infrastructure. Do not merge them or add a second compose-up to either.

6. **No override vars in production** — `COGNI_LLM_ADAPTER` is only respected when `APP_ENV=test`. Production always uses real adapters. The env schema must enforce this.

---

## Related Docs

- [Testing Strategy](TESTING.md) — current APP_ENV=test pattern and adapter wiring docs
- [Tool Use Spec](TOOL_USE_SPEC.md) — DENY_BY_DEFAULT, tool policy, toolRunner.exec() as single enforcement point
- [Environments](ENVIRONMENTS.md) — stack deployment modes
- [Database RLS Spec](DATABASE_RLS_SPEC.md) — testcontainers harness design and RLS validation

---

**Last Updated**: 2026-02-06
**Status**: Draft
