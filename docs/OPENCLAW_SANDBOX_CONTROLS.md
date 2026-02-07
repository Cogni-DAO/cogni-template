# OpenClaw Sandbox Controls Design

> [!CRITICAL]
> Sandbox agents produce code changes inside `network=none` containers. **Host-side git relay** handles all credential-bearing operations (clone, push, PR creation). Sandbox never holds git credentials. UI surfaces are Cogni-native (Next.js), not OpenClaw's gateway UI.

## Core Invariants

> Numbering continues from [OPENCLAW_SANDBOX_SPEC.md](OPENCLAW_SANDBOX_SPEC.md) invariants 13–19.

20. **HOST_SIDE_GIT_RELAY**: All git operations requiring credentials (clone, push, PR create) execute on the host, never inside the sandbox. Agent commits locally inside the container; host extracts and pushes after container exit.

21. **CATALOG_FROM_API**: Chat UI fetches agent list from `GET /api/v1/ai/agents` at runtime. No hardcoded `AVAILABLE_GRAPHS` array. The API returns both langgraph and sandbox agents — the hook is a full replacement.

22. **ENV_CREDENTIALS_FIRST**: P1 uses `GITHUB_TOKEN` env var on the host for git push + PR creation. No `ConnectionBroker` dependency. Upgrade to GitHub App installation auth (via `TENANT_CONNECTIONS_SPEC.md`) at P2.

23. **WORKSPACE_SURVIVES_FOR_PUSH**: When git relay is enabled, workspace cleanup is deferred until after host-side push completes. Provider must not `rmSync` workspace in the `finally` block when a push is pending.

24. **COGNI_NATIVE_UI**: Dashboard and controls are Next.js pages within the existing app shell. OpenClaw's Lit-based Control UI is not exposed (invariant 18: NO_OPENCLAW_DASHBOARD). All observability routes through Cogni's existing Pino/Loki/Langfuse/Prometheus stack.

25. **AGENT_VARIANTS_IN_REGISTRY**: Multiple sandbox agent types (simple LLM, OpenClaw coder) are entries in `SANDBOX_AGENTS` registry inside `SandboxGraphProvider`. Each maps to an image + argv + limits + workspace setup function. No separate providers per agent type.

---

## Implementation Checklist

### P0: Dynamic Agent Catalog + OpenClaw Wiring

Wire the existing `sandbox:agent` and new `sandbox:openclaw` into the live catalog API so the chat UI discovers them dynamically.

- [ ] Replace hardcoded `AVAILABLE_GRAPHS` in `ChatComposerExtras` with `GET /api/v1/ai/agents` fetch (hook: `useAgents()`). This replaces all 5 entries (4 langgraph + 1 sandbox) — see `CATALOG_STATIC_IN_P0` TODO already in source.
- [ ] Add `sandbox:openclaw` entry to `SANDBOX_AGENTS` registry in `sandbox-graph.provider.ts` with OpenClaw-specific image, argv, limits, and workspace setup
- [ ] Add `sandbox:openclaw` to `SANDBOX_AGENT_DESCRIPTORS` in `sandbox-agent-catalog.provider.ts`
- [ ] Create workspace setup function for OpenClaw: writes `.openclaw/openclaw.json`, `.cogni/prompt.txt`, `AGENTS.md`, `SOUL.md`
- [ ] Add optional `image` field to `SandboxRunSpec` port type — per-run override of adapter's constructor-level `imageName` default (`cogni-sandbox-runtime:latest`)
- [ ] In `SandboxRunnerAdapter.runOnce()`: use `spec.image ?? this.imageName` when creating the container

#### Chores

- [ ] Observability: add `agentVariant` field to sandbox log events (distinguishes `agent` vs `openclaw`)
- [ ] Documentation: update [OPENCLAW_SANDBOX_SPEC.md](OPENCLAW_SANDBOX_SPEC.md) status

### P1: Host-Side Git Relay

Agent makes code changes and commits locally inside the sandbox. Host clones before, pushes after. Git relay is provider-level logic wrapping `runOnce()` — it does NOT belong in `SandboxRunSpec` (the port handles container execution only).

- [ ] Pre-run in `SandboxGraphProvider`: host clones repo into `${workspacePath}/repo` (shallow, single-branch) using `GITHUB_TOKEN` for private repos
- [ ] Post-run in `SandboxGraphProvider`: host reads `git log` + `git diff` from workspace to determine if changes exist
- [ ] If changes: host pushes branch `sandbox/${runId}` using `GITHUB_TOKEN` from env
- [ ] If changes + PR requested: host creates PR via GitHub API (`octokit` or `gh` CLI)
- [ ] Return PR URL in `GraphFinal.content` (appended to agent response text)
- [ ] Defer workspace cleanup until push completes (per invariant 23)

### P2: Sandbox Dashboard + Metrics

- [ ] Condition: P1 git relay is operational and agents are producing PRs
- [ ] Add Prometheus counters in `SandboxGraphProvider`: `sandbox_runs_total{agent,status}`, `sandbox_run_duration_seconds{agent}`
- [ ] Add `/sandbox` page: run history table (runId, agent, model, status, duration, cost, PR link)
- [ ] Add per-run detail view: agent output, stderr diagnostics, proxy audit log, Langfuse trace link
- [ ] Add Grafana dashboard using existing Alloy → Mimir pipeline
- [ ] **Do NOT build preemptively** — dashboard value requires run volume from P1

### P2: Agentic Evolution

- [ ] Condition: P1 git relay operational, `sandbox:openclaw` producing useful runs
- [ ] Dashboard-driven agent + skill creation: allow adding new OpenClaw agent personalities (model, skills, system prompt) from the Cogni dashboard. **Note:** config changes require git commit + deployment propagation to reach the full DAO deployment — this is not a hot-reload path.
- [ ] Leverage OpenClaw's multi-agent routing: OpenClaw natively supports multiple agent configs (`agents.list` in `openclaw.json`) and `--agent <id>` selection. Today we hardcode `--agent main`. Evolve to let the Cogni graph selector choose which OpenClaw personality to invoke per-run (e.g., `researcher`, `coder`, `reviewer`), each with distinct model and skill sets.
- [ ] Evaluate OpenClaw subagent spawning: a running agent can internally spawn sub-agents for parallel task decomposition (e.g., "research X while coding Y"). This works within our sandbox constraints (same LLM proxy socket, same container lifetime) but needs timeout budgeting — sub-agents share the `--timeout 540` / `maxRuntimeSec: 600` envelope.

---

## File Pointers (P0 Scope)

| File                                                            | Change                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/features/ai/components/ChatComposerExtras.tsx`             | Replace `AVAILABLE_GRAPHS` with `useAgents()` hook (removes all 5 hardcoded entries) |
| `src/features/ai/hooks/useAgents.ts`                            | New: fetch `GET /api/v1/ai/agents`, return `GraphOption[]`                           |
| `src/adapters/server/sandbox/sandbox-graph.provider.ts`         | Add `sandbox:openclaw` to `SANDBOX_AGENTS` with image, argv, limits, workspace setup |
| `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts` | Add `sandbox:openclaw` descriptor                                                    |
| `src/ports/sandbox-runner.port.ts`                              | Add optional `image?: string` to `SandboxRunSpec`                                    |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`         | Use `spec.image ?? this.imageName` in container creation                             |

---

## Design Decisions

### 1. Agent Variant Registry (not separate providers)

| Agent              | Image                                       | Limits        | Workspace Setup                                       |
| ------------------ | ------------------------------------------- | ------------- | ----------------------------------------------------- |
| `sandbox:agent`    | `cogni-sandbox-runtime` (adapter default)   | 120s / 512MB  | Write `messages.json` only                            |
| `sandbox:openclaw` | `cogni-sandbox-openclaw` (per-run override) | 600s / 1024MB | Write `openclaw.json` + `prompt.txt` + behavior files |

**Rule:** One `SandboxGraphProvider` handles all sandbox agents. Agent-specific logic lives in the registry entry's workspace setup function, not in separate provider classes.

**OpenClaw argv** (joined by provider, run via entrypoint `bash -lc`):

```
node /app/dist/index.js agent --local --agent main
  --session-id ${runId}
  --message "$(cat /workspace/.cogni/prompt.txt)"
  --json --timeout 540
```

**OpenClaw env** (via `llmProxy.env`):

```
HOME=/workspace
OPENCLAW_CONFIG_PATH=/workspace/.openclaw/openclaw.json
OPENCLAW_STATE_DIR=/workspace/.openclaw-state
OPENCLAW_LOAD_SHELL_ENV=0
```

**OpenClaw limits rationale:** OpenClaw runs a multi-turn tool loop (5–50+ LLM calls per run). Container `maxRuntimeSec: 600` with OpenClaw `--timeout 540` gives 60s for clean exit before hard kill. Memory increased to 1024MB because OpenClaw loads Node.js runtime + dependencies (~300MB baseline).

**Image override**: `SandboxRunSpec.image` overrides the adapter's constructor-level `imageName` default. This lets the provider select image per-agent without needing multiple adapter instances.

---

### 2. Host-Side Git Relay Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ PRE-RUN (host, in SandboxGraphProvider)                              │
│ ─────────────────────────                                            │
│ 1. git clone --depth=1 --branch=${baseBranch} ${repoUrl} repo/      │
│ 2. git -C repo/ checkout -b sandbox/${runId}                         │
│ 3. Write workspace files (.cogni/, .openclaw/)                       │
│ 4. Result: workspace ready                                           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX RUN (container, network=none, via SandboxRunnerPort)         │
│ ─────────────────────────────────────                                │
│ - Agent reads /workspace/repo/**, calls LLM, modifies files         │
│ - Agent runs: git add -A && git commit -m "..." (local only)         │
│ - No push (no credentials, no network)                               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ POST-RUN (host, in SandboxGraphProvider)                             │
│ ─────────────────────────────────────────                            │
│ 1. git -C repo/ log --oneline ${baseBranch}..HEAD → changes?        │
│ 2. If no changes: skip, cleanup workspace                            │
│ 3. If changes: git push origin sandbox/${runId}                      │
│ 4. If createPr: POST /repos/{owner}/{repo}/pulls                    │
│ 5. Cleanup workspace after push completes                            │
└─────────────────────────────────────────────────────────────────────┘
```

**Why host-side?** Per SECRETS_HOST_ONLY (invariant 4) and HOST_SIDE_CLONE (invariant 6). The agent can `git commit` locally because git doesn't require credentials for local operations. Only push/PR creation needs tokens, and those stay on the host.

**Why not on `SandboxRunSpec`?** The port (`SandboxRunnerPort`) handles container execution only. Git relay is provider-level orchestration that wraps `runOnce()` — clone before, push after. This keeps the port interface simple and the security boundary clear.

---

### 3. Dynamic Catalog vs Hardcoded Graphs

Current state: `ChatComposerExtras` has a hardcoded `AVAILABLE_GRAPHS` array with 5 entries (brain, poet, ponderer, research, sandbox:agent) and a `CATALOG_STATIC_IN_P0` TODO noting this is temporary.

**P0 fix:** Create `useAgents()` hook that fetches `GET /api/v1/ai/agents` and maps to `GraphOption[]`. The API already returns both langgraph agents (from `LangGraphInProcAgentCatalogProvider`) and sandbox agents (from `SandboxAgentCatalogProvider`), so the hook fully replaces the hardcoded array.

```typescript
// useAgents.ts
export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const res = await fetch("/api/v1/ai/agents");
      const data = await res.json();
      return data.agents.map((a) => ({
        graphId: a.graphId,
        name: a.name,
        description: a.description,
      }));
    },
    staleTime: 5 * 60 * 1000, // 5 min — catalog changes rarely
  });
}
```

**Never** hardcode agent entries in UI components. The `AgentCatalogProvider` pipeline is the single source.

---

### 4. Credential Strategy (Phased)

**P1: Env var**

- `GITHUB_TOKEN` in host `.env` (not in sandbox, not in proxy)
- Used by `SandboxGraphProvider` post-run for `git push` + `octokit.pulls.create()`
- Scoped to the org/repos this Cogni instance operates on

**P2: GitHub App Installation**

- Per-repo scoped tokens via `TENANT_CONNECTIONS_SPEC.md` `ConnectionBroker`
- `credential_type: "github_app_installation"`
- `SandboxGraphProvider` calls `broker.resolveForTool()` before push
- Multi-tenant: each billing account has its own GitHub App installation

**Never** pass `GITHUB_TOKEN` into the sandbox container. The host-side relay is the only consumer.

---

## Anti-Patterns

| Pattern                                    | Problem                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| Pass `GITHUB_TOKEN` to sandbox env         | Violates SECRETS_HOST_ONLY; agent could exfiltrate          |
| OpenClaw gateway inside sandbox            | Invariant 17; requires network listeners                    |
| Port OpenClaw's Lit UI                     | Wrong framework (we use Next.js), assumes gateway WebSocket |
| Separate `GraphProvider` per agent variant | Over-engineering; registry pattern is simpler               |
| Hardcode graphs in UI component            | Drifts from API catalog; violates CATALOG_FROM_API          |
| `git push` inside sandbox container        | Network=none; would require breaking isolation              |
| Git relay config on `SandboxRunSpec` port  | Port handles container exec only; git is provider-level     |
| Build dashboard before git relay works     | No data to show; build P2 after P1 produces runs            |
| Build `ConnectionBroker` for P1            | Over-engineering; env var sufficient for single-org         |

---

## Related Documents

- [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) — Core sandbox invariants 1–12, phase definitions
- [OPENCLAW_SANDBOX_SPEC.md](OPENCLAW_SANDBOX_SPEC.md) — OpenClaw container image, config, I/O protocol
- [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) — P2 credential management via ConnectionBroker
- [SANDBOX_SCALING.md](SANDBOX_SCALING.md) — Proxy architecture, threat model
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, AggregatingGraphExecutor
- [AGENT_DISCOVERY.md](AGENT_DISCOVERY.md) — AgentCatalogPort, discovery pipeline

---

**Last Updated**: 2026-02-07
**Status**: Draft
