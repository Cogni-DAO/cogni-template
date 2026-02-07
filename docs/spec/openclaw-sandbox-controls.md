---
id: openclaw-sandbox-controls-spec
type: spec
title: OpenClaw Sandbox Controls Design
status: active
spec_state: draft
trust: draft
summary: Host-side git relay, dynamic agent catalog, credential strategy, and anti-patterns for sandbox code agents
read_when: Implementing sandbox agent variants, git relay, or sandbox dashboard
owner: derekg1729
created: 2026-02-07
verified: 2026-02-07
tags: [sandbox, openclaw]
---

# OpenClaw Sandbox Controls Design

> [!CRITICAL]
> Sandbox agents produce code changes inside `network=none` containers. **Host-side git relay** handles all credential-bearing operations (clone, push, PR creation). Sandbox never holds git credentials. UI surfaces are Cogni-native (Next.js), not OpenClaw's gateway UI.

## Context

The sandbox runtime (SANDBOXED_AGENTS.md, invariants 1-19) provides isolated container execution. This spec extends that foundation with controls for OpenClaw-specific agent variants, host-side git relay for code PRs, dynamic catalog discovery, and credential management.

## Goal

Define the invariants and design contracts for sandbox agents that produce code changes: how agent variants are registered, how git credentials are kept off the sandbox, how the UI discovers agents dynamically, and how the credential strategy evolves from env vars to GitHub App installation auth.

## Non-Goals

- OpenClaw's gateway UI or Lit-based Control UI (COGNI_NATIVE_UI)
- Passing git credentials into sandbox containers (SECRETS_HOST_ONLY)
- Building dashboard before git relay is operational (P2 condition)
- Hot-reload agent configuration (requires git commit + deployment)

## Core Invariants

> Numbering continues from [OPENCLAW_SANDBOX_SPEC.md](OPENCLAW_SANDBOX_SPEC.md) invariants 13–19.

20. **HOST_SIDE_GIT_RELAY**: All git operations requiring credentials (clone, push, PR create) execute on the host, never inside the sandbox. Agent commits locally inside the container; host extracts and pushes after container exit.

21. **CATALOG_FROM_API**: Chat UI fetches agent list from `GET /api/v1/ai/agents` at runtime. No hardcoded `AVAILABLE_GRAPHS` array. The API returns both langgraph and sandbox agents — the hook is a full replacement.

22. **ENV_CREDENTIALS_FIRST**: P1 uses `GITHUB_TOKEN` env var on the host for git push + PR creation. No `ConnectionBroker` dependency. Upgrade to GitHub App installation auth (via `TENANT_CONNECTIONS_SPEC.md`) at P2.

23. **WORKSPACE_SURVIVES_FOR_PUSH**: When git relay is enabled, workspace cleanup is deferred until after host-side push completes. Provider must not `rmSync` workspace in the `finally` block when a push is pending.

24. **COGNI_NATIVE_UI**: Dashboard and controls are Next.js pages within the existing app shell. OpenClaw's Lit-based Control UI is not exposed (invariant 18: NO_OPENCLAW_DASHBOARD). All observability routes through Cogni's existing Pino/Loki/Langfuse/Prometheus stack.

25. **AGENT_VARIANTS_IN_REGISTRY**: Multiple sandbox agent types (simple LLM, OpenClaw coder) are entries in `SANDBOX_AGENTS` registry inside `SandboxGraphProvider`. Each maps to an image + argv + limits + workspace setup function. No separate providers per agent type.

---

## Design

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

## Acceptance Checks

**Automated:**

- `pnpm check:docs` — validates spec frontmatter and required headings

**Manual:**

1. Verify `GET /api/v1/ai/agents` returns both langgraph and sandbox agents
2. Verify sandbox container has no network access and no git credentials
3. Verify host-side git relay pushes branch after successful agent run (P1)

## Related

- **Initiative:** [ini.sandboxed-agents](../../work/initiatives/ini.sandboxed-agents.md) — Roadmap, deliverables, file pointers
- [Sandboxed Agents](../SANDBOXED_AGENTS.md) — Core sandbox invariants 1–12, phase definitions (pending migration)
- [OpenClaw Sandbox Spec](../OPENCLAW_SANDBOX_SPEC.md) — OpenClaw container image, config, I/O protocol (pending migration)
- [Tenant Connections](tenant-connections.md) — P2 credential management via ConnectionBroker
- [Sandbox Scaling](../SANDBOX_SCALING.md) — Proxy architecture, threat model (pending migration)
- [Graph Execution](../GRAPH_EXECUTION.md) — GraphExecutorPort (pending migration)
- [Agent Discovery](agent-discovery.md) — AgentCatalogPort, discovery pipeline
