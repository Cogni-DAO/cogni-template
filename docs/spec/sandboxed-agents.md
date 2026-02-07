---
id: sandboxed-agents-spec
type: spec
title: Sandboxed Agent System
status: draft
spec_state: draft
trust: draft
summary: Core architecture for running AI agents in network-isolated Docker containers with LLM access via unix socket proxy, billing attribution, and host-side git relay.
read_when: Working on sandbox agent execution, proxy plumbing, container lifecycle, or billing integration.
implements:
owner: derekg1729
created: 2026-02-07
verified: 2026-02-07
tags: [sandbox, ai-agents, docker, security]
---

# Sandboxed Agent System

## Context

Cogni needs to run AI agents (OpenClaw, custom scripts) in isolated containers with LLM access but without exposing secrets or network connectivity. The sandbox system is a `GraphProvider` routed via `AggregatingGraphExecutor`. It is NOT user-invocable — it requires a system `ExecutionGrant` with `allowSandbox` gate. Secrets never enter the sandbox. All LLM calls flow via a unix-socket proxy container (nginx:alpine) managed by `LlmProxyManager`.

## Goal

Enable AI agents to run in hermetically-sealed Docker containers (`network=none`) with LLM access via unix socket proxy, billing attribution via LiteLLM, and structured output parsing — all without exposing secrets, credentials, or network access to the agent.

## Non-Goals

- Tool execution gateway (P1 — see initiative)
- Authenticated external tools via ConnectionBroker (P1.5)
- Multi-turn persistent agent sessions (P2)
- Sandbox warm pools or pre-provisioned containers
- Streaming agent output (currently batch-only)

## Core Invariants

1. **HERMETIC_STACK**: Stack tests require only Docker + repo checkout. No host-installed binaries (no brew/apt nginx).

2. **SANDBOX_IS_GRAPH_PROVIDER**: Sandbox implements `GraphProvider`, registered in `AggregatingGraphExecutor`.

3. **SYSTEM_GRANT_REQUIRED**: Requires `ExecutionGrant` with `allowSandbox: true`. NOT user-invocable.

4. **SECRETS_HOST_ONLY**: No tokens in sandbox FS/env/logs. Host-controlled proxy container injects credentials. Proxy config (contains keys) is never mounted into sandbox — only the socket volume (`/llm-sock`) is shared.

5. **NETWORK_DEFAULT_DENY**: Sandbox runs `network=none` always. All external IO via mounted unix socket only.

6. **HOST_SIDE_CLONE**: Host clones repo into workspace volume. Sandbox never has Git credentials.

7. **APPEND_ONLY_AUDIT**: All proxy traffic logged by proxy container. Sandbox self-report not trusted.

8. **WRITE_PATH_IS_BRANCH**: Push to branch by default. PR creation only when explicitly requested.

9. **LLM_VIA_SOCKET_ONLY**: Sandbox calls LLM ONLY via `localhost:8080 → unix socket → proxy container → LiteLLM`. No network access.

10. **HOST_INJECTS_BILLING_HEADERS**: Proxy injects billing + observability headers matching in-proc `LiteLlmAdapter` behavior. Client-sent `x-litellm-*` headers stripped/overwritten. Required headers:
    - `x-litellm-end-user-id: ${billingAccountId}` — matches in-proc `user: billingAccountId` for dashboard parity
    - `x-litellm-spend-logs-metadata: {"run_id":"...","attempt":0,"user_id":"...","graph_id":"sandbox:agent","existing_trace_id":"...","session_id":"...","trace_user_id":"..."}` — run correlation + Langfuse observability

11. **LITELLM_IS_BILLING_TRUTH**: Do not count tokens in proxy. LiteLLM `/spend/logs` is the authoritative billing source. Query by `end_user=billingAccountId`, filter by `metadata.run_id` for per-run reconciliation.

12. **SANDBOX_RUNID_IS_SESSION**: `runId` = one sandbox session = one `runOnce()` call. All LLM calls within a session share one runId. One proxy per runId. Long-running session semantics (P1.5+) will extend this but never split a session across multiple runIds.

## Schema

**Port types** (`src/ports/sandbox-runner.port.ts`):

```typescript
interface SandboxRunnerPort {
  runOnce(spec: SandboxRunSpec): Promise<SandboxRunResult>;
}
interface SandboxRunSpec {
  runId: string;
  workspacePath: string;
  argv: string[]; // Command parts, joined and passed to entrypoint.sh
  limits: { maxRuntimeSec: number; maxMemoryMb: number };
  networkMode?: { mode: "none" } | { mode: "internal"; networkName: string };
  llmProxy?: { enabled: boolean; attempt: number }; // P0.5+
}
interface SandboxRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  errorCode?: "timeout" | "oom_killed" | "internal" | "container_failed";
}
```

## Design

### LLM Socket Bridge Architecture (As-Built)

Per-run resources created by `LlmProxyManager`:

```
PER-RUN RESOURCES:
  Docker volume: llm-socket-{runId}   ← shared between proxy + sandbox
  Host: {base}/{runId}/nginx.conf     ← proxy-only bind mount (contains LITELLM_MASTER_KEY)
  Host: {base}/{runId}/access.log     ← copied from proxy on stop (audit)

┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX (network=none)                                              │
│ ──────────────────────                                              │
│  Agent Runtime (OpenClaw, Clawdbot, etc.)                           │
│    └─ OPENAI_API_BASE=http://localhost:8080                         │
│                                                                     │
│  socat (localhost:8080 ↔ /llm-sock/llm.sock)                       │
│  Volume: llm-socket-{runId} → /llm-sock (socket only, no config)   │
└────────────────────────┼────────────────────────────────────────────┘
                         │ Docker volume (hermetic, no host bind mount)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PROXY CONTAINER: nginx:alpine (on sandbox-internal network)         │
│ ─────────────────────────────────────────────────────               │
│  Volume: llm-socket-{runId} → /llm-sock                            │
│  Bind:   {base}/{runId}/nginx.conf → /etc/nginx/nginx.conf:ro      │
│  - Managed by LlmProxyManager via dockerode                         │
│  - Listens on unix socket in shared Docker volume                   │
│  - Injects: Authorization: Bearer ${LITELLM_MASTER_KEY}             │
│  - Injects: x-litellm-end-user-id: ${billingAccountId}              │
│  - Injects: x-litellm-spend-logs-metadata: {run_id, attempt, Langfuse fields} │
│  - Forwards to http://litellm:4000 (Docker DNS)                     │
│  - Audit logs copied to host on stop (not visible to sandbox)        │
└─────────────────────────────────────────────────────────────────────┘
```

Proxy runs as nginx:alpine container (not host process) for HERMETIC_STACK compliance. Config-only, no bespoke code. Proxy config is never mounted into sandbox (SECRETS_HOST_ONLY). Docker volumes (not bind mounts) are used for socket sharing — this avoids macOS osxfs unix socket issues and prevents tmpfs at `/run` from masking the mount.

### Graph Execution Flow (As-Built)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Chat UI                                                              │
│   body: { graphName: "sandbox:agent", model: "...", messages: [...] }│
└──────────────────┬───────────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────────────┐
│ ai_runtime.ts → resolvedGraphId = "sandbox:agent" (passthrough)     │
│ AggregatingGraphExecutor → SandboxGraphProvider.runGraph(req)       │
└──────────────────┬───────────────────────────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────────────────────────┐
│ SandboxGraphProvider                                                 │
│  1. Write messages → /workspace/.cogni/messages.json                 │
│  2. SandboxRunnerAdapter.runOnce({ llmProxy: { enabled: true } })   │
│  3. Agent reads messages, calls OPENAI_API_BASE, prints response    │
│  4. Collect stdout → emit text_delta AiEvents                       │
│  5. Query LiteLLM /spend/logs?end_user=${runId}/0 → emit usage     │
│  6. Return GraphFinal { ok, usage, content }                        │
└──────────────────────────────────────────────────────────────────────┘
```

### Agent I/O Protocol (Non-Streaming)

- **Input**: Provider writes `GraphRunRequest.messages` as JSON to `/workspace/.cogni/messages.json`
- **Output**: Agent prints assistant response to **stdout** (plain text). Provider wraps as `text_delta`.
- **Model**: Provider passes `model` via env var `COGNI_MODEL` (agent uses it in API call)
- **Non-streaming**: Runs agent to completion, then emits entire response. Streaming deferred.

### Key Decisions

#### 1. Unix Socket Bridge over Docker Networking

**Decision**: Use `network=none` + mounted unix socket instead of internal Docker network for LLM access.

**P0.5a explored**: Internal Docker network (`sandbox-internal`) with `internal: true` to block internet while allowing LiteLLM access. This worked but required network connectivity.

**P0.5 uses**: Complete network isolation (`network=none`) with unix socket in a shared Docker volume. Proxy runs as nginx:alpine container on sandbox-internal network. A socat process in the sandbox bridges `localhost:8080` to the socket.

```
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX (network=none)                                              │
│                                                                     │
│  Agent → localhost:8080 → socat → /llm-sock/llm.sock               │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ shared socket volume (Docker volume)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PROXY: nginx:alpine (sandbox-internal) → litellm:4000                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Why socket over network**:

- Stronger isolation: no network stack at all in sandbox
- Simpler attack surface: no DNS, no IP routing
- Maintains NETWORK_DEFAULT_DENY invariant strictly
- Socket mount is explicit and auditable

#### 2. OSS Proxy First, CogniGateway Later

**Decision**: P0.5 uses config-only OSS reverse proxy (Nginx). P1 upgrades to Node.js CogniGateway when tool execution is needed.

**P0.5**: Nginx with static config — header injection, forwarding, access logging. No code.

**P1**: Node.js CogniGateway — same LLM proxy + `/tool/exec` endpoint. Bespoke code justified by tool execution needs.

**Why OSS first**:

- Config-only is simpler to maintain and audit
- Avoids premature complexity
- Streaming/retry edge cases handled by battle-tested proxy
- Only accept bespoke code when we need programmable behavior (tools)

#### 3. LiteLLM as Billing Truth (No Proxy Token Counting)

**Decision**: Do not count tokens in the proxy. LiteLLM is the authoritative billing source. `end_user = billingAccountId` everywhere (matches in-proc `LiteLlmAdapter`). Run correlation via `metadata.run_id`.

**Why**:

- Streaming + retries make proxy-side token counting brittle
- LiteLLM already tracks usage per `end_user`
- Sandbox bills inline: trusted proxy captures `x-litellm-call-id` per call → `usageUnitId`
- External executors (P1) reconcile via `GET /spend/logs?end_user=${billingAccountId}`, filter by `metadata.run_id`
- See [external-executor-billing.md](./external-executor-billing.md) for inline vs reconciliation decision guide

#### 4. Agent in Sandbox from P0.5 (Skip Host-Owned Loop)

**Decision**: Run the agent (OpenClaw, Clawdbot, etc.) inside the sandbox from P0.5. Skip the "host-owned LLM loop" design.

**Why**:

- Simpler architecture: agent is a black box, we just provide LLM access
- Faster path to running OpenClaw/Clawdbot
- Host-owned loop adds orchestration complexity without clear benefit
- Agent autonomy is constrained by network isolation + socket-only IO

#### 5. No Tools or ConnectionBroker in P0.5

**Decision**: P0.5 provides LLM access only. No tool execution gateway, no ConnectionBroker.

**P0.5 scope**: Agent can call LLM. That's it. Agent uses its own built-in tools (file read/write, shell within workspace).

**P1 adds**: Tool execution gateway for external integrations.

**P1.5 adds**: Authenticated tools via ConnectionBroker.

**Why**: MVP should prove LLM loop works. Tools add complexity. Ship the minimal thing first.

#### 6. Host-Side Clone + Push

**Decision**: Host clones repo and pushes branches. Sandbox never has Git credentials.

```
HOST: repoPort.cloneToWorkspace()
  │
  ▼ workspace volume ready
SANDBOX: makes changes, commits locally
  │
  ▼ patches exported
HOST: repoPort.pushBranchFromPatches()
```

**Why**: Credentials stay on host. Sandbox can't exfiltrate tokens.

### Anti-Patterns

| Pattern                            | Problem                                          |
| ---------------------------------- | ------------------------------------------------ |
| Any network mode except `none`     | Violates NETWORK_DEFAULT_DENY; use socket bridge |
| GitHub token in sandbox env        | Credential exfiltration risk                     |
| LITELLM_MASTER_KEY in sandbox      | Violates SECRETS_HOST_ONLY; inject in host proxy |
| Clone inside sandbox               | Needs credentials; clone on host                 |
| Token counting in proxy            | Brittle; use LiteLLM /spend/logs as truth        |
| Bespoke proxy in P0.5              | Over-engineering; use OSS proxy until P1         |
| Auth tools before P1.5             | Requires ConnectionBroker; defer to P1.5         |
| Auto-PR every run                  | Noisy, no review gate                            |
| Shell tool in gateway              | Escapes all policy                               |
| Sandbox self-reported audit        | Can't trust; host must write audit               |
| runId from sandbox input           | Must be host-generated                           |
| Trust client x-litellm-end-user-id | Must strip and override in proxy                 |
| Wire into user chat API            | Must require system grant                        |

### File Pointers

| File                                                            | Purpose                                                |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `services/sandbox-runtime/Dockerfile`                           | Sandbox container image (node:20-slim + socat + agent) |
| `services/sandbox-runtime/entrypoint.sh`                        | socat bridge + exec agent command                      |
| `services/sandbox-runtime/agent/run.mjs`                        | Minimal agent script (reads messages, calls LLM)       |
| `platform/infra/services/sandbox-proxy/nginx.conf.template`     | Proxy config template (header injection, forwarding)   |
| `platform/infra/services/sandbox-proxy/README.md`               | Proxy documentation                                    |
| `platform/infra/services/runtime/docker-compose.dev.yml`        | sandbox-internal network config                        |
| `src/ports/sandbox-runner.port.ts`                              | SandboxRunnerPort + SandboxProgramContract types       |
| `src/ports/index.ts`                                            | Port barrel exports                                    |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`         | Dockerode-based container lifecycle                    |
| `src/adapters/server/sandbox/llm-proxy-manager.ts`              | nginx proxy lifecycle (start/stop/cleanup per-run)     |
| `src/adapters/server/sandbox/sandbox-graph.provider.ts`         | GraphProvider impl (routes sandbox:\* graphs)          |
| `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts` | AgentCatalogProvider (lists sandbox agents)            |
| `src/adapters/server/sandbox/index.ts`                          | Adapter barrel exports                                 |
| `src/adapters/server/index.ts`                                  | Server adapter barrel exports                          |
| `src/bootstrap/graph-executor.factory.ts`                       | SandboxGraphProvider registration                      |
| `src/bootstrap/agent-discovery.ts`                              | SandboxAgentCatalogProvider registration               |
| `tests/integration/sandbox/network-isolation.int.test.ts`       | P0 network isolation tests                             |
| `tests/stack/sandbox/sandbox-litellm.stack.test.ts`             | P0.5a LiteLLM reachability tests                       |
| `tests/stack/sandbox/sandbox-llm-completion.stack.test.ts`      | P0.5 LLM socket bridge tests                           |

## Acceptance Checks

**Automated:**

- `pnpm test:int -- network-isolation` — P0 network isolation, workspace I/O, timeout handling
- `pnpm test:stack:dev -- sandbox-litellm` — P0.5a LiteLLM reachability
- `pnpm test:stack:dev -- sandbox-llm` — P0.5 socket bridge, proxy forwarding

**Manual (E2E validated 2026-02-07):**

```
curl POST /api/v1/ai/chat
  { graphName: "sandbox:agent", model: "nemotron-nano-30b", messages: [...] }

→ AggregatingGraphExecutor routes to SandboxGraphProvider
→ Provider writes /workspace/.cogni/messages.json
→ SandboxRunnerAdapter creates Docker container (network=none, LLM proxy enabled)
→ entrypoint.sh starts socat bridge (localhost:8080 → /llm-sock/llm.sock)
→ run.mjs reads messages, calls LiteLLM via proxy, outputs SandboxProgramContract envelope
→ Provider parses envelope, emits text_delta + usage_report AiEvents
→ SSE stream delivers response: "Hello, dear friend, welcome back!"
→ GraphFinal: { ok: true, finishReason: "stop" }
```

Verified: agent catalog discovery (`GET /api/v1/ai/agents` lists `sandbox:agent`),
free model passthrough (no credits required), billing headers injected by proxy.

**Dev Commands:**

```bash
pnpm sandbox:docker:build          # build sandbox runtime image
pnpm dev:stack:test                 # start test stack (postgres, litellm, etc.)
pnpm test:stack:dev -- sandbox-llm  # run P0.5 sandbox tests against dev stack
```

## Open Questions

_(None — spec reflects as-built state)_

## Related

- [Sandboxed Agents Initiative](../../work/initiatives/ini.sandboxed-agents.md) — roadmap: tool gateway, OpenClaw wiring, git relay, dashboard
- [OpenClaw Sandbox Controls](./openclaw-sandbox-controls.md) — Invariants 20-25, OpenClaw-specific design decisions
- [OpenClaw Sandbox Spec](./openclaw-sandbox-spec.md) — Invariants 13-19, container image, LLM protocol, I/O protocol
- [Sandbox Scaling](./sandbox-scaling.md) — Proxy comparison, per-run architecture, threat model
- [Graph Execution](./graph-execution.md) — GraphExecutorPort, billing
- [Tool Use](./tool-use.md) — Tool execution, DENY_BY_DEFAULT
- [RBAC](./rbac.md) — ExecutionGrant, allowSandbox gate
- [Tenant Connections](./tenant-connections.md) — ConnectionBroker (P1.5)
