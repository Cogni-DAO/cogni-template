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

## Design Notes

- **Credential Strategy (Phased):** P1 uses `GITHUB_TOKEN` env var on host. P2 upgrades to GitHub App installation auth via `TENANT_CONNECTIONS_SPEC.md` `ConnectionBroker` for multi-tenant per-repo scoped tokens.
- **Never** pass `GITHUB_TOKEN` into the sandbox container. The host-side relay is the only consumer.
