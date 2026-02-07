---
work_item_id: ini.sandboxed-agents
work_item_type: initiative
title: Sandboxed Agents — OpenClaw Integration, Git Relay & Dashboard
state: Active
priority: 1
estimate: 5
summary: Wire OpenClaw into sandbox agent catalog, build host-side git relay for code PRs, add sandbox dashboard and metrics
outcome: Sandbox agents (simple + OpenClaw) discoverable via API catalog, producing code PRs via host-side git relay, with observability dashboard
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [sandbox, openclaw, ai-agents]
---

# Sandboxed Agents — OpenClaw Integration, Git Relay & Dashboard

> Source: docs/OPENCLAW_SANDBOX_CONTROLS.md (roadmap content extracted during docs migration)

## Goal

Wire the existing `sandbox:agent` and new `sandbox:openclaw` into the live agent catalog API, build a host-side git relay so sandbox agents can produce code PRs without holding credentials, and add observability through a sandbox dashboard and Prometheus metrics.

## Roadmap

### Crawl (P0) — Dynamic Agent Catalog + OpenClaw Wiring

**Goal:** Wire sandbox agents into the live catalog API so the chat UI discovers them dynamically.

| Deliverable                                                     | Status      | Est | Work Item |
| --------------------------------------------------------------- | ----------- | --- | --------- |
| Replace hardcoded `AVAILABLE_GRAPHS` with `useAgents()` hook    | Not Started | 2   | —         |
| Add `sandbox:openclaw` to `SANDBOX_AGENTS` registry             | Not Started | 2   | —         |
| Add `sandbox:openclaw` to `SANDBOX_AGENT_DESCRIPTORS`           | Not Started | 1   | —         |
| OpenClaw workspace setup function                               | Not Started | 2   | —         |
| Optional `image` field on `SandboxRunSpec` port type            | Not Started | 1   | —         |
| `SandboxRunnerAdapter.runOnce()` uses `spec.image ?? imageName` | Not Started | 1   | —         |

**Details:**

- Replace hardcoded `AVAILABLE_GRAPHS` in `ChatComposerExtras` with `GET /api/v1/ai/agents` fetch (hook: `useAgents()`). This replaces all 5 entries (4 langgraph + 1 sandbox) — see `CATALOG_STATIC_IN_P0` TODO already in source.
- OpenClaw workspace setup: writes `.openclaw/openclaw.json`, `.cogni/prompt.txt`, `AGENTS.md`, `SOUL.md`
- Image override: `SandboxRunSpec.image` overrides the adapter's constructor-level `imageName` default

**Chores:**

- [ ] Observability: add `agentVariant` field to sandbox log events (distinguishes `agent` vs `openclaw`)
- [ ] Documentation: update OPENCLAW_SANDBOX_SPEC.md status

**File Pointers (P0 Scope):**

| File                                                            | Change                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/features/ai/components/ChatComposerExtras.tsx`             | Replace `AVAILABLE_GRAPHS` with `useAgents()` hook (removes all 5 hardcoded entries) |
| `src/features/ai/hooks/useAgents.ts`                            | New: fetch `GET /api/v1/ai/agents`, return `GraphOption[]`                           |
| `src/adapters/server/sandbox/sandbox-graph.provider.ts`         | Add `sandbox:openclaw` to `SANDBOX_AGENTS` with image, argv, limits, workspace setup |
| `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts` | Add `sandbox:openclaw` descriptor                                                    |
| `src/ports/sandbox-runner.port.ts`                              | Add optional `image?: string` to `SandboxRunSpec`                                    |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`         | Use `spec.image ?? this.imageName` in container creation                             |

### Walk (P1) — Host-Side Git Relay

**Goal:** Agent makes code changes and commits locally inside the sandbox. Host clones before, pushes after.

| Deliverable                                              | Status      | Est | Work Item            |
| -------------------------------------------------------- | ----------- | --- | -------------------- |
| Pre-run host clone into workspace                        | Not Started | 2   | (create at P1 start) |
| Post-run host reads git log/diff for changes             | Not Started | 1   | (create at P1 start) |
| Host pushes branch `sandbox/${runId}` using GITHUB_TOKEN | Not Started | 2   | (create at P1 start) |
| Host creates PR via GitHub API if requested              | Not Started | 2   | (create at P1 start) |
| Return PR URL in GraphFinal.content                      | Not Started | 1   | (create at P1 start) |
| Defer workspace cleanup until push completes             | Not Started | 1   | (create at P1 start) |

Git relay is provider-level logic wrapping `runOnce()` — it does NOT belong in `SandboxRunSpec` (the port handles container execution only).

### Run (P2) — Sandbox Dashboard + Metrics + Agentic Evolution

**Goal:** Observability and multi-agent capabilities.

| Deliverable                                                               | Status      | Est | Work Item            |
| ------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Prometheus counters: `sandbox_runs_total`, `sandbox_run_duration_seconds` | Not Started | 1   | (create at P2 start) |
| `/sandbox` page: run history table                                        | Not Started | 3   | (create at P2 start) |
| Per-run detail view: output, stderr, proxy log, Langfuse link             | Not Started | 2   | (create at P2 start) |
| Grafana dashboard via Alloy → Mimir pipeline                              | Not Started | 1   | (create at P2 start) |
| Dashboard-driven agent + skill creation                                   | Not Started | 3   | (create at P2 start) |
| OpenClaw multi-agent routing (--agent selection per-run)                  | Not Started | 2   | (create at P2 start) |
| Evaluate OpenClaw subagent spawning for parallel tasks                    | Not Started | 2   | (create at P2 start) |

**Conditions:** P1 git relay operational, agents producing PRs. Do NOT build dashboard preemptively.

**Agentic Evolution Notes:**

- Dashboard-driven agent creation: config changes require git commit + deployment propagation — this is not a hot-reload path
- OpenClaw natively supports multiple agent configs (`agents.list` in `openclaw.json`) and `--agent <id>` selection. Today we hardcode `--agent main`. Evolve to let the Cogni graph selector choose which OpenClaw personality to invoke per-run.
- Sub-agents share the `--timeout 540` / `maxRuntimeSec: 600` envelope — needs timeout budgeting.

### Roadmap — OpenClaw Container & E2E Integration Track

> Source: docs/OPENCLAW_SANDBOX_SPEC.md (roadmap content extracted during docs migration)

#### Pre-Crawl (P0): Get OpenClaw Running in Sandbox

**Goal**: Prove OpenClaw runs in `network=none` sandbox, calls LLM via socket proxy, and billing headers reach LiteLLM. No graph provider wiring, no agent catalog, no reconciliation — just the container lifecycle working end-to-end.

**Principles**: Use `openclaw:local` as-is (no slimming). Fix only what's broken. Follow repo invariants.

| Deliverable                                                                       | Status      | Notes                                                                      |
| --------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- |
| `services/sandbox-openclaw/Dockerfile` (thin layer over `openclaw:local`)         | Done        | 4s build, reuses entrypoint.sh from sandbox-runtime                        |
| `entrypoint.sh` (socat bridge + bash -lc)                                         | Done        | Copied from `services/sandbox-runtime/`                                    |
| Validate `node /app/dist/index.js --version` → `2026.2.4`                         | Done        |                                                                            |
| Fix `nginx.conf.template`: `x-litellm-metadata` → `x-litellm-spend-logs-metadata` | Done        | Header rename for spend log correlation                                    |
| Fix all doc references for header rename                                          | Done        | SANDBOXED_AGENTS.md, EXTERNAL_EXECUTOR_BILLING.md, sandbox-proxy/AGENTS.md |
| LLM roundtrip: OpenClaw agent calls LiteLLM, gets response                        | Done        | nemotron-nano-30b, 22s, 2128 tokens                                        |
| JSON output parses: stdout valid JSON with `payloads` and `meta`                  | Done        | See `tests/_fixtures/sandbox/openclaw-expected-output.json`                |
| Verify metadata JSON includes `run_id`, `attempt`, `graph_id`                     | Not Started | Already present in `LlmProxyManager.generateConfig`                        |
| Smoke: network isolated (`curl` from container fails)                             | Not Started |                                                                            |
| Smoke: no secrets in container (env has no `LITELLM_MASTER_KEY`)                  | Not Started |                                                                            |
| Smoke: spend logs have `run_id` matching our `runId`                              | Not Started |                                                                            |

**P0 Dockerfile (thin layer, as-built):**

```dockerfile
FROM openclaw:local
USER root
RUN apt-get update && apt-get install -y --no-install-recommends socat \
  && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh
RUN chmod 755 /usr/local/bin/sandbox-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint.sh"]
```

Reuses existing `services/sandbox-runtime/entrypoint.sh` (socat bridge + `bash -lc "$@"`). No multi-stage build, no file pruning, no user creation (adapter sets `User` at container create time).

**Cold Boot Verification (2026-02-07):**

- Config loaded correctly (`provider: "cogni"`, `model: "gemini-2.5-flash"`)
- No setup/onboarding phase (`skipBootstrap: true` works)
- State written to `OPENCLAW_STATE_DIR` (sessions, transcripts) — not to readonly rootfs
- Valid JSON envelope on stdout (`payloads`, `meta`, `agentMeta`)
- Timed out reaching LLM at localhost:8080 (expected — no proxy in this test)
- Missing workspace files (AGENTS.md, SOUL.md) handled gracefully (noted as missing, no crash)

**Environment & Config — Path Resolution Mechanisms:**

OpenClaw has three path-resolution mechanisms that can leak secrets or break on readonly rootfs. All three must be controlled:

1. **Config file** (`OPENCLAW_CONFIG_PATH`): Points to the exact `.json` file. Set to `/workspace/.openclaw/openclaw.json` (on writable workspace mount).
2. **State directory** (`OPENCLAW_STATE_DIR`): Where sessions, transcripts, caches go. Set to `/workspace/.openclaw-state` (writable). Prevents fallback to `$HOME/.openclaw` which would fail on readonly rootfs.
3. **Dotenv loading** (`loadDotEnv()`): Loads `.env` from CWD + `$OPENCLAW_STATE_DIR/.env`. Prevent by ensuring no `.env` file exists in `/workspace/` or `/workspace/.openclaw-state/`.
4. **Shell env fallback** (`OPENCLAW_LOAD_SHELL_ENV`): Off by default. Explicitly set to `0` as defense-in-depth.
5. **HOME**: Set to `/workspace` so any `$HOME` writes go to writable mount, not readonly rootfs.

> **Source**: `src/config/paths.ts:49-74` (state dir), `src/config/paths.ts:95-104` (config path), `src/infra/dotenv.ts:6-20` (dotenv). Verified against OpenClaw v2026.2.4.

**P0 Scope Constraints:**

- No dynamic model-catalog sync from LiteLLM config
- No multi-stage "minimal file set" pruning of the 4GB image
- No perfect billing reconciliation — just prove spend logs contain `run_id` + `call_id`
- No `SandboxGraphProvider` / agent catalog / bootstrap wiring (that's P0.75)

**File Pointers (P0):**

| File                                                        | Status  |
| ----------------------------------------------------------- | ------- |
| `services/sandbox-openclaw/Dockerfile`                      | Done    |
| `services/sandbox-openclaw/entrypoint.sh`                   | Done    |
| `platform/infra/services/sandbox-proxy/nginx.conf.template` | Fixed   |
| `tests/_fixtures/sandbox/openclaw-config.json`              | Done    |
| `tests/_fixtures/sandbox/openclaw-expected-output.json`     | Done    |
| `scripts/diag-openclaw-sandbox.mjs`                         | WIP     |
| `tests/stack/sandbox/sandbox-openclaw.stack.test.ts`        | Pending |

#### Pre-Crawl (P0.75): Graph Execution Wiring (E2E)

**Trigger**: P0 proves OpenClaw runs in sandbox. Now wire it into the graph execution pipeline so users can select it in the chat UI.

**SandboxGraphProvider:**

- [ ] Create `src/adapters/server/sandbox/sandbox-graph.provider.ts`:
  - `providerId: "sandbox"`
  - `canHandle(graphId)`: matches `sandbox:*`
  - `runGraph(req)`: write openclaw.json + prompt → call `runOnce()` → parse JSON → emit AiEvents
- [ ] Write workspace files (.openclaw/openclaw.json, .cogni/prompt.txt)
- [ ] Parse OpenClaw JSON output → `text_delta` AiEvents → `GraphFinal`
- [ ] Handle agent errors (meta.error, non-zero exit, invalid JSON)

**Agent Catalog:**

- [ ] Create `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts`:
  - `listAgents()`: returns `sandbox:agent` entry
  - Gated by `SANDBOX_ENABLED` env flag

**Bootstrap Wiring:**

- [ ] Wire `SandboxGraphProvider` in `graph-executor.factory.ts`
- [ ] Wire `SandboxAgentCatalogProvider` in `agent-discovery.ts`
- [ ] Add `SANDBOX_ENABLED` feature flag, gate both registrations
- [ ] Wire `SandboxRunnerAdapter` + config into provider constructor

**Billing Reconciliation:**

- [ ] Query LiteLLM `/spend/logs?end_user=${billingAccountId}`, filter by `metadata.run_id`
- [ ] Sum token usage across all LLM calls in the run
- [ ] Emit `usage_report` AiEvent → `charge_receipt`

**Tests (P0.75 Merge Gates):**

- [ ] **E2E chat flow**: `POST /api/v1/ai/chat` with `graphName: "sandbox:agent"` → SSE response
- [ ] **Agent catalog**: `GET /api/v1/ai/agents` includes `sandbox:agent` when `SANDBOX_ENABLED=true`
- [ ] **Billing verified**: `charge_receipts` has entry matching `runId`
- [ ] **Graceful failure**: Agent error → structured `GraphFinal.error`

**File Pointers (P0.75):**

| File                                                            | Status  |
| --------------------------------------------------------------- | ------- |
| `src/adapters/server/sandbox/sandbox-graph.provider.ts`         | Pending |
| `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts` | Pending |
| `src/bootstrap/graph-executor.factory.ts`                       | Update  |
| `src/bootstrap/agent-discovery.ts`                              | Update  |
| `tests/stack/sandbox/sandbox-openclaw-e2e.stack.test.ts`        | Pending |

#### Future: Custom Agents, Conversation Continuity, Optimization (P1+/P2+)

**Creating Custom Agents (P1+):**

For DAO-specific agents or specialized roles, extend the `agents.list` in the generated config:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        default: true,
        workspace: "/workspace",
      },
      {
        id: "code-reviewer",
        workspace: "/workspace",
        model: { primary: "cogni/claude-sonnet-4.5" },
        tools: {
          deny: ["exec"], // read-only: no bash
        },
      },
    ],
  },
}
```

Invoke with `--agent code-reviewer` instead of `--agent main`.

**Conversation Continuity P1+ (Workspace-Injected Context):**

For multi-turn conversations, the `SandboxGraphProvider` can inject prior messages into workspace files:

```
/workspace/.cogni/
├── prompt.txt            # current user message
└── conversation.md       # prior messages (system prompt injection)
```

And reference it in `AGENTS.md`:

```markdown
Read /workspace/.cogni/conversation.md for prior context before responding.
```

**Conversation Continuity P2+ (Persistent Sessions):**

For DAO agents with persistent workspace (ONE_WORKSPACE_PER_DAO pattern), mount the workspace volume across runs so OpenClaw's session transcripts, memory files, and `MEMORY.md` persist.

**Streaming Passthrough (P1+, OQ-4):**

OpenClaw internally streams LLM responses (SSE). In `--json` mode, it buffers the entire response and outputs the final envelope. For future streaming support, would likely require running OpenClaw without `--json` and parsing stdout incrementally.

**OpenClaw Version Pinning (P1, OQ-6):**

The `openclaw:local` tag is mutable. Options: pin to a specific OpenClaw git SHA in the Dockerfile, tag our image with the OpenClaw version, or use a content-addressed image reference. Resolution: Use `LABEL openclaw.version=${GIT_SHA}` in the Dockerfile. Pin `openclaw:local` builds to specific commits.

**Multi-Stage Docker Build Optimization (OQ-1):**

What is the minimal file set to copy from `openclaw:local` for embedded agent mode? Specifically: is `ui/dist/` needed for `--local` mode? Is `skills/` lazy-loaded? Are `docs/reference/templates/` needed when `skipBootstrap: true`? What `node_modules` can be pruned? Resolution: Build and test iteratively — `openclaw agent --local --agent main --message "hello" --json`.

**Model Catalog Sync Strategy:**

Should the model catalog be generated at build time (baked into image) or dynamically at each run? Dynamic is more flexible but adds startup latency. Build-time means rebuilding on model changes. Recommendation: generate at run time in `SandboxGraphProvider`, since LiteLLM config may change without image rebuilds.

**Token Budget (P1+):**

Should we add a `max_tokens_per_run` budget? This would require either: (a) rate limiting in the proxy (not supported in nginx, would need OpenResty), or (b) a token-counting wrapper. Deferred per SANDBOX_SCALING.md.

**Skills Audit:**

OpenClaw skills (in `skills/` directory) provide domain-specific behavior. Skills requiring network access (web search, APIs) are non-functional in the sandbox. Skills that work with local files (coding patterns, documentation) work fine. Need to audit which skills are sandbox-compatible and decide whether to bundle a curated set into the `cogni-sandbox-openclaw` image or strip all skills. Skills add to image size and system prompt length.

## Constraints

- HOST_SIDE_GIT_RELAY: All credential-bearing git ops on host, never in sandbox
- CATALOG_FROM_API: Chat UI fetches agent list from API, no hardcoded arrays
- ENV_CREDENTIALS_FIRST: P1 uses GITHUB_TOKEN env var, P2 upgrades to GitHub App installation auth
- WORKSPACE_SURVIVES_FOR_PUSH: Workspace cleanup deferred until after host-side push
- COGNI_NATIVE_UI: Dashboard is Next.js, NOT OpenClaw's Lit-based Control UI
- AGENT_VARIANTS_IN_REGISTRY: One SandboxGraphProvider, multiple agent types via registry entries

## Dependencies

- [x] SandboxGraphProvider + SandboxRunnerAdapter (existing)
- [x] Agent catalog API: `GET /api/v1/ai/agents` (existing)
- [x] OpenClaw container image (existing: `openclaw:local`)
- [ ] GITHUB_TOKEN provisioning for P1 git relay

## As-Built Specs

- [OpenClaw Sandbox Controls](../../docs/spec/openclaw-sandbox-controls.md) — Invariants 20-25, design decisions, anti-patterns
- [OpenClaw Sandbox Spec](../../docs/spec/openclaw-sandbox-spec.md) — Invariants 13-19, container image, LLM protocol, I/O protocol, billing

## Design Notes

- **Credential Strategy (Phased):** P1 uses `GITHUB_TOKEN` env var on host. P2 upgrades to GitHub App installation auth via `TENANT_CONNECTIONS_SPEC.md` `ConnectionBroker` for multi-tenant per-repo scoped tokens.
- **Never** pass `GITHUB_TOKEN` into the sandbox container. The host-side relay is the only consumer.
