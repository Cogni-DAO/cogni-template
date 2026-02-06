# Handoff: Sandbox P0.5 → P0.75

## Goal

Ship sandboxed agent containers with LLM access, billing attribution, and Langfuse observability — all through the standard graph execution pipeline. Users select a sandbox agent in chat UI, it runs in a `network=none` Docker container with LLM access via unix socket proxy, and billing/observability works identically to in-proc graphs.

## Branch

`feat/sandbox-0.5` — PR #328 open against `staging`.

## Status

**P0.5 (proxy plumbing): COMPLETE.** Socket bridge, nginx proxy container, socat, security hardening, tests — all done.

**P0.75 (E2E graph execution): IN PROGRESS — doc spec complete, code not started.**

Last session focused on aligning sandbox billing headers with the in-proc `LiteLlmAdapter` path. Key decision made and documented:

- `x-litellm-end-user-id` = `billingAccountId` (NOT `runId/attempt`) — matches in-proc, keeps activity dashboard working
- Run correlation via `x-litellm-metadata` JSON header (carries `run_id`, `attempt`, Langfuse fields)
- `litellm_call_id` captured in nginx audit log for deterministic reconciliation

**Uncommitted doc edits exist** — the nginx template, SANDBOXED_AGENTS.md, EXTERNAL_EXECUTOR_BILLING.md, and SANDBOX_SCALING.md all have unstaged changes reflecting this decision. Review with `git diff`.

**Developer's code changes were stashed** (userId plumbing, sock/:ro mount, symlink hardening). Check `git stash list`.

## What Needs Doing (P0.75)

The spec is in `docs/SANDBOXED_AGENTS.md` under "P0.75: Sandbox Agent via Graph Execution (End-to-End)". Key deliverables:

1. **`SandboxGraphProvider`** — implements `GraphProvider`, routes `sandbox:*` graphIds
2. **`SandboxAgentCatalogProvider`** — exposes `sandbox:agent` in agent catalog (gated by `SANDBOX_ENABLED`)
3. **Bootstrap wiring** — register both providers, wire `SandboxRunnerAdapter` with `litellmMasterKey`
4. **Minimal agent script** (`services/sandbox-runtime/agent/run.mjs`) — reads messages JSON, calls `OPENAI_API_BASE`, prints response
5. **Billing reconciliation** — query LiteLLM `/spend/logs?end_user=billingAccountId`, filter by `metadata.run_id`
6. **Nginx template** — wire `BILLING_ACCOUNT_ID` + `LITELLM_METADATA_JSON` substitution vars through `LlmProxyConfig` → `generateConfig`

## Critical Design Decisions

- **`end_user` = `billingAccountId` everywhere** — see `docs/EXTERNAL_EXECUTOR_BILLING.md` invariant #1
- **Metadata parity** — sandbox proxy must inject the same LiteLLM metadata fields as `src/adapters/server/ai/litellm.adapter.ts:174-183` (the in-proc path)
- **sock/ vs conf/ split** — `LlmProxyManager` separates socket dir (shared with sandbox) from config dir (proxy-only, contains secrets). See commit `a2ba29b2`.
- **No streaming in P0.75** — agent runs to completion, entire response emitted as `text_delta`. Keep it boring.

## Key Files

| File                                                        | What                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `docs/SANDBOXED_AGENTS.md`                                  | Master spec — invariants, phase checklists, architecture diagrams                 |
| `docs/EXTERNAL_EXECUTOR_BILLING.md`                         | Billing reconciliation pattern (recently updated)                                 |
| `docs/SANDBOX_SCALING.md`                                   | P1+ scaling roadmap, threat model                                                 |
| `platform/infra/services/sandbox-proxy/nginx.conf.template` | Nginx config template (needs `BILLING_ACCOUNT_ID` + `LITELLM_METADATA_JSON` vars) |
| `src/adapters/server/sandbox/llm-proxy-manager.ts`          | Proxy container lifecycle (start/stop/cleanup, `generateConfig` substitution)     |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`     | Docker container runner (`runOnce()`)                                             |
| `src/ports/sandbox-runner.port.ts`                          | Port interfaces (`SandboxRunSpec`, `SandboxLlmProxyConfig`)                       |
| `src/adapters/server/ai/litellm.adapter.ts:169-184`         | In-proc LiteLLM request body — **the standard** sandbox must match                |
| `src/ports/llm.port.ts:103-133`                             | `LlmCaller` / `GraphLlmCaller` — caller context flowing through graph execution   |
| `src/ports/graph-executor.port.ts:30-62`                    | `GraphRunRequest` — what `SandboxGraphProvider.runGraph()` receives               |
| `src/features/ai/services/ai_runtime.ts`                    | `RunEventRelay` pump+fanout — how billing events flow                             |
| `src/features/ai/services/billing.ts`                       | `commitUsageFact()` — the one ledger writer                                       |
| `tests/stack/sandbox/sandbox-llm-completion.stack.test.ts`  | P0.5 stack tests                                                                  |
| `tests/_fixtures/sandbox/fixtures.ts`                       | Shared sandbox test helpers                                                       |

## Validation

- `pnpm check` — fast lint/type gate
- `pnpm test:stack:dev -- sandbox-llm` — P0.5 proxy tests (requires `dev:stack:test` running)
- P0.75 merge gates listed in `docs/SANDBOXED_AGENTS.md` under "Tests (Merge Gates)" for P0.75
