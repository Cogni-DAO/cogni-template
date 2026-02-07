# Sandboxed Agent System

> [!CRITICAL]
> Sandbox is a **GraphProvider** routed via `AggregatingGraphExecutor`. NOT user-invocable—requires system `ExecutionGrant` with `allowSandbox` gate. Secrets never enter sandbox. All LLM calls via unix-socket proxy container (nginx:alpine) managed by LlmProxyManager.

## Core Invariants (All Phases)

1. **HERMETIC_STACK**: Stack tests require only Docker + repo checkout. No host-installed binaries (no brew/apt nginx).

2. **SANDBOX_IS_GRAPH_PROVIDER**: Sandbox implements `GraphProvider`, registered in `AggregatingGraphExecutor`.

3. **SYSTEM_GRANT_REQUIRED**: Requires `ExecutionGrant` with `allowSandbox: true`. NOT user-invocable.

4. **SECRETS_HOST_ONLY**: No tokens in sandbox FS/env/logs. Host-controlled proxy container injects credentials. Proxy config (contains keys) is never mounted into sandbox — only the socket volume (`/llm-sock`) is shared.

5. **NETWORK_DEFAULT_DENY**: Sandbox runs `network=none` always. All external IO via mounted unix socket only.

6. **HOST_SIDE_CLONE**: Host clones repo into workspace volume. Sandbox never has Git credentials.

7. **APPEND_ONLY_AUDIT**: All proxy traffic logged by proxy container. Sandbox self-report not trusted.

8. **WRITE_PATH_IS_BRANCH**: Push to branch by default. PR creation only when explicitly requested.

## P0.5+ Invariants

9. **LLM_VIA_SOCKET_ONLY**: Sandbox calls LLM ONLY via `localhost:8080 → unix socket → proxy container → LiteLLM`. No network access.

10. **HOST_INJECTS_BILLING_HEADERS**: Proxy injects billing + observability headers matching in-proc `LiteLlmAdapter` behavior. Client-sent `x-litellm-*` headers stripped/overwritten. Required headers:
    - `x-litellm-end-user-id: ${billingAccountId}` — matches in-proc `user: billingAccountId` for dashboard parity
    - `x-litellm-spend-logs-metadata: {"run_id":"...","attempt":0,"user_id":"...","graph_id":"sandbox:agent","existing_trace_id":"...","session_id":"...","trace_user_id":"..."}` — run correlation + Langfuse observability

11. **LITELLM_IS_BILLING_TRUTH**: Do not count tokens in proxy. LiteLLM `/spend/logs` is the authoritative billing source. Query by `end_user=billingAccountId`, filter by `metadata.run_id` for per-run reconciliation.

12. **SANDBOX_RUNID_IS_SESSION**: `runId` = one sandbox session = one `runOnce()` call. All LLM calls within a session share one runId. One proxy per runId. Long-running session semantics (P1.5+) will extend this but never split a session across multiple runIds.

---

## Dev Commands

```bash
pnpm sandbox:docker:build          # build sandbox runtime image
pnpm dev:stack:test                 # start test stack (postgres, litellm, etc.)
pnpm test:stack:dev -- sandbox-llm  # run P0.5 sandbox tests against dev stack
```

---

## Phase Definitions

| Phase     | Network Mode | LLM Access                | Description                                                  |
| --------- | ------------ | ------------------------- | ------------------------------------------------------------ |
| **P0**    | none         | N/A                       | Spike: prove network isolation + workspace I/O               |
| **P0.5a** | internal     | Direct (unauthenticated)  | Spike: prove LiteLLM reachable via internal network          |
| **P0.5**  | none         | unix socket → OSS proxy   | Proxy plumbing: socket bridge, nginx container, socat.       |
| **P0.75** | none         | socket proxy (proven E2E) | Agent runs via graph execution, chat UI, billing verified.   |
| **P1**    | none         | socket + tool gateway     | Add tool execution gateway for external integrations.        |
| **P1.5**  | none         | socket + tools + Clawdbot | Clawdbot runtime + authenticated tools via ConnectionBroker. |

> **Key Insight**: P0.5a proved internal-network connectivity works, but P0.5 uses `network=none` + unix socket for stronger isolation. The socket bridge makes networking unnecessary.

---

## Implementation Checklist

### P0: Sandbox Spike (COMPLETE)

Prove network isolation, workspace I/O, and one-shot container lifecycle. No LLM integration, no gateway, no Temporal.

#### Infrastructure

- [x] Create `services/sandbox-runtime/Dockerfile`:
  - Base: `node:20-slim`
  - Install: curl, git, jq, bash
  - User: non-root `sandboxer`
  - Entrypoint: `bash -c` for one-shot command execution

#### Ports (`src/ports/`)

- [x] Create `src/ports/sandbox-runner.port.ts`:
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
- [x] Export from `src/ports/index.ts`

#### Adapters (`src/adapters/server/sandbox/`)

- [x] Create `sandbox-runner.adapter.ts`:
  - Implements `SandboxRunnerPort`
  - Uses dockerode for container lifecycle
  - `docker create` with `NetworkMode: 'none'`, memory limits, capability drop
  - Volume mount: `${workspacePath}:/workspace:rw`
  - Timeout handling with container kill
  - Log collection (demuxed stdout/stderr)
  - Cleanup in `finally` block (no orphan containers)
- [x] Create `index.ts` barrel export
- [x] Export `SandboxRunnerAdapter` from `src/adapters/server/index.ts`

#### Tests (Merge Gates)

- [x] **Network isolation**: `curl` from sandbox fails (network=none enforced)
- [x] **Workspace read/write**: Container can read/write `/workspace`, host sees changes
- [x] **Stdout/stderr separation**: Logs captured correctly
- [x] **Exit code propagation**: Non-zero exit codes returned
- [x] **Timeout handling**: Long-running commands killed, returns `errorCode: 'timeout'`
- [x] **No orphan containers**: Cleanup verified in afterEach hook

#### File Pointers (P0)

| File                                                      | Status   |
| --------------------------------------------------------- | -------- |
| `services/sandbox-runtime/Dockerfile`                     | Complete |
| `src/ports/sandbox-runner.port.ts`                        | Complete |
| `src/ports/index.ts`                                      | Updated  |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`   | Complete |
| `src/adapters/server/sandbox/index.ts`                    | Complete |
| `src/adapters/server/index.ts`                            | Updated  |
| `tests/integration/sandbox/network-isolation.int.test.ts` | Complete |

---

### P0.5a: LiteLLM Reachability Spike (COMPLETE)

Prove sandbox container can reach LiteLLM via internal Docker network while remaining isolated from the public internet.

> **Known Gap**: P0.5a proves network connectivity (health endpoint) but NOT actual LLM completions. Per SECRETS_HOST_ONLY invariant, we cannot pass `LITELLM_MASTER_KEY` to the container. P0.5 CogniGateway will solve this by proxying authenticated requests from host.

#### Infrastructure

- [x] Add `sandbox-internal` network to `docker-compose.dev.yml`:
  - `internal: true` — Prevents internet egress via external gateway
  - Attach `litellm` service to this network
- [x] Extend `SandboxRunSpec` with `networkMode` option:
  - `mode: 'none'` (default) — Complete isolation (P0 baseline)
  - `mode: 'internal'` + `networkName` — Attach to named internal network
- [x] Change `SandboxRunSpec.command` to `argv: string[]` for explicit invocation
- [x] Fix TIMEOUT_RACE_LEAK: clearTimeout when waitPromise wins
- [x] Fix LOG_COLLECTION_INCORRECT: handle stream with demuxStream
- [x] Fix NETWORK_FLAGS_CONFLICT: use only NetworkMode, remove NetworkDisabled
- [x] Add SECURITY_HARDENING: no-new-privileges, PidsLimit, ReadonlyRootfs with Tmpfs
- [x] Add OUTPUT_BOUNDS: truncate logs at configurable max bytes (default 2MB)
- [ ] Align `sandbox-runtime` CI image with SERVICES_ARCHITECTURE.md (fingerprint tagging, GHA cache, GHCR publish)

#### Tests (Merge Gates)

- [x] **LiteLLM reachable**: Container gets HTTP 200 from `http://litellm:4000/health/liveliness`
- [x] **No default route**: `ip route show default` returns empty (definitive isolation proof)
- [x] **DNS blocked**: `getent hosts example.com` fails
- [x] **IP blocked**: `curl http://1.1.1.1` fails
- [x] **No Docker socket**: `/var/run/docker.sock` not mounted
- [x] **LiteLLM DNS resolves**: `getent hosts litellm` succeeds (internal DNS works)

#### File Pointers (P0.5a)

| File                                                     | Status   |
| -------------------------------------------------------- | -------- |
| `platform/infra/services/runtime/docker-compose.dev.yml` | Updated  |
| `src/ports/sandbox-runner.port.ts`                       | Updated  |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`  | Updated  |
| `tests/stack/sandbox/sandbox-litellm.stack.test.ts`      | Complete |

---

### P0.5: Agent in Sandbox with LLM via Unix Socket

**Goal**: OpenClaw/Clawdbot runs inside sandbox (`network=none`) and can call LiteLLM without secrets in sandbox, with run-scoped billing attribution.

#### Architecture

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

**Design Choice**: Proxy runs as nginx:alpine container (not host process) for HERMETIC_STACK compliance. Config-only, no bespoke code. Proxy config is never mounted into sandbox (SECRETS_HOST_ONLY). Only build a Node proxy if committing to full CogniGateway at P1.

#### Infrastructure

- [x] Create `platform/infra/services/sandbox-proxy/nginx.conf.template`:
  - Listen on unix socket in shared `/llm-sock/` directory
  - Inject `Authorization: Bearer ${LITELLM_MASTER_KEY}` (from template substitution)
  - Inject `x-litellm-end-user-id: ${billingAccountId}` + `x-litellm-spend-logs-metadata` (overwrites client-sent)
  - Forward to `http://litellm:4000` (Docker DNS on sandbox-internal)
  - Access log: timestamp, runId, model, status (no request body/secrets)
- [x] Update `services/sandbox-runtime/Dockerfile`:
  - Add `socat` for socket-to-localhost bridging
  - Add entrypoint wrapper that starts socat before main command
- [x] Create `services/sandbox-runtime/entrypoint.sh`:
  - Start `socat TCP-LISTEN:8080,fork,bind=127.0.0.1 UNIX-CONNECT:/llm-sock/llm.sock &`
  - Exec the main agent command
  - Note: P0.5 uses entrypoint for socat; argv passed as Cmd to entrypoint

#### Adapters (`src/adapters/server/sandbox/`)

- [x] Extend `SandboxRunnerAdapter.runOnce()`:
  - Before container start: start nginx:alpine proxy container via LlmProxyManager
  - Mount socket volume into sandbox at `/llm-sock:rw` (not config dir)
  - Set env: `OPENAI_API_BASE=http://localhost:8080`, `RUN_ID=${runId}`
  - After container exits: stop proxy container, audit log persists in conf/
- [x] Create `src/adapters/server/sandbox/llm-proxy-manager.ts`:
  - `start(runId, attempt)`: create nginx:alpine container on sandbox-internal, return Docker volume name
  - `stop(runId)`: copy access log, stop/remove container and volume
  - `cleanup(runId)`: delete host config directory (caller decides when)
  - Config bind-mounted into proxy with 0o600 perms (never in socket volume)

#### Bootstrap (`src/bootstrap/`)

- [ ] Wire `SandboxRunnerPort` in `container.ts`
- [ ] Add `SANDBOX_ENABLED` feature flag (default false)
- [ ] Add `allowSandbox` field to `ExecutionGrant` schema

#### Tests (Merge Gates)

> **Note**: Stack tests run without internet. Tests verify proxy infrastructure works; actual LLM completions require integration tests with internet access.

- [x] **Socket bridge works**: Sandbox can reach proxy `/health` endpoint via localhost:8080
- [x] **Proxy forwards**: Requests reach LiteLLM (connection established, even if backend unreachable)
- [x] **Network isolation**: Sandbox without llmProxy cannot reach localhost:8080 or external IPs
- [x] **No secrets in sandbox**: Container env contains no `LITELLM_MASTER_KEY` or `OPENAI_API_KEY`
- [x] **OPENAI_API_BASE set**: Container env has `OPENAI_API_BASE=http://localhost:8080`
- [x] **Header stripping**: Proxy accepts requests with spoofed headers (doesn't break)
- [ ] **LLM completion succeeds**: `/v1/chat/completions` returns valid response (requires internet)
- [ ] **Attribution injection**: LiteLLM receives `x-litellm-end-user-id: ${billingAccountId}` + `x-litellm-spend-logs-metadata` with `run_id` (verify via spend logs)

#### File Pointers (P0.5)

| File                                                        | Status   |
| ----------------------------------------------------------- | -------- |
| `platform/infra/services/sandbox-proxy/nginx.conf.template` | Complete |
| `platform/infra/services/sandbox-proxy/README.md`           | Complete |
| `services/sandbox-runtime/Dockerfile`                       | Complete |
| `services/sandbox-runtime/entrypoint.sh`                    | Complete |
| `src/adapters/server/sandbox/llm-proxy-manager.ts`          | Complete |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`     | Complete |
| `src/ports/sandbox-runner.port.ts`                          | Complete |
| `tests/stack/sandbox/sandbox-llm-completion.stack.test.ts`  | Complete |

---

### P0.75: Sandbox Agent via Graph Execution (End-to-End)

**Goal**: User selects sandbox agent in chat UI → message flows through `AggregatingGraphExecutor` → agent runs in sandboxed container with LLM access → response streams back → billing tracked via LiteLLM.

**Trigger**: P0.5 proxy plumbing works. Now prove it's usable: a real agent running in sandbox, invoked through the standard chat pipeline, with verifiable billing.

> **No tool calling.** Agent has LLM access only. Workspace file I/O is local to the container. This phase proves the execution loop; P1 adds tools.

#### Architecture

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

#### Agent I/O Protocol (P0.75 — simple, non-streaming)

- **Input**: Provider writes `GraphRunRequest.messages` as JSON to `/workspace/.cogni/messages.json`
- **Output**: Agent prints assistant response to **stdout** (plain text). Provider wraps as `text_delta`.
- **Model**: Provider passes `model` via env var `COGNI_MODEL` (agent uses it in API call)
- **Non-streaming**: P0.75 runs agent to completion, then emits entire response. Streaming deferred.

#### Adapters (`src/adapters/server/sandbox/`)

- [x] Create `sandbox-graph.provider.ts` implementing `GraphProvider`:
  - `providerId: "sandbox"`
  - `canHandle(graphId)`: matches `sandbox:*` prefix
  - `runGraph(req)`: create tmp workspace (symlink-safe) → write messages.json → call `SandboxRunnerAdapter.runOnce()` → parse stdout → emit AiEvents → return `GraphFinal`
  - Passes `caller.userId` → proxy → `x-litellm-customer-id` header
  - Socket dir mounted `:ro` in sandbox (proxy has `:rw`)
- [x] Create `sandbox-agent-catalog.provider.ts` implementing `AgentCatalogProvider`:
  - `listAgents()`: returns `[{ agentId: "sandbox:agent", graphId: "sandbox:agent", name: "Sandbox Agent", description: "LLM agent in isolated container" }]`
  - Gated by `LITELLM_MASTER_KEY` presence (not separate `SANDBOX_ENABLED` flag)

#### Bootstrap (`src/bootstrap/`)

- [x] Register `SandboxGraphProvider` in `graph-executor.factory.ts` providers array
- [x] Register `SandboxAgentCatalogProvider` in `agent-discovery.ts` providers array
- [x] Gate both registrations on `LITELLM_MASTER_KEY` presence
- [x] Wire `SandboxRunnerAdapter` + `litellmMasterKey` into provider constructor

#### Agent Runtime (`services/sandbox-runtime/`)

- [x] Create minimal agent script (`services/sandbox-runtime/agent/run.mjs`):
  - Read `/workspace/.cogni/messages.json`
  - Call `${OPENAI_API_BASE}/v1/chat/completions` with messages + `COGNI_MODEL`
  - Output `SandboxProgramContract` JSON envelope to stdout (matches OpenClaw `--json`)
  - Exit 0 on success, non-zero on error (envelope always present for structured parsing)
- [x] Define `SandboxProgramContract` as port-level type in `sandbox-runner.port.ts`
- [x] Update `Dockerfile` to include agent script at `/agent/run.mjs`
- [x] Default `argv` in provider: `["node", "/agent/run.mjs"]`

#### Billing (Inline via Trusted Proxy)

- [x] Proxy injects billing headers: `x-litellm-end-user-id: ${billingAccountId}` + `x-litellm-spend-logs-metadata` (run correlation + Langfuse)
- [x] Nginx audit log captures `$upstream_http_x_litellm_call_id` for per-call tracing
- [x] Provider emits `usage_report` AiEvent so `RunEventRelay` commits charge_receipt
- [ ] Capture `x-litellm-call-id` from proxy response inline for `usageUnitId` (per [GRAPH_EXECUTOR_AUDIT.md](GRAPH_EXECUTOR_AUDIT.md) P0 item #2)
- [ ] Set `executorType: "sandbox"` in UsageFact (per `UsageFactStrictSchema`)
- [ ] Verify `charge_receipts` table has entry with `source_reference = ${runId}/0/${litellmCallId}`

#### Tests (Merge Gates)

- [ ] **E2E chat flow**: `POST /api/v1/ai/chat` with `graphName: "sandbox:agent"` → SSE response with assistant text
- [ ] **Agent catalog**: `GET /api/v1/ai/agents` includes `sandbox:agent` when `SANDBOX_ENABLED=true`
- [ ] **Billing verified**: After sandbox run, `charge_receipts` table has entry matching `runId`
- [ ] **LiteLLM spend match**: `x-litellm-end-user-id` in spend logs matches `billingAccountId`, `metadata.run_id` matches `runId`
- [ ] **No secrets in response**: Sandbox stdout does not contain `LITELLM_MASTER_KEY`
- [ ] **Graceful failure**: Agent error (bad model, timeout) returns structured error via `GraphFinal.error`

#### File Pointers (P0.75)

| File                                                            | Status   |
| --------------------------------------------------------------- | -------- |
| `src/adapters/server/sandbox/sandbox-graph.provider.ts`         | Complete |
| `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts` | Complete |
| `src/bootstrap/graph-executor.factory.ts`                       | Complete |
| `src/bootstrap/agent-discovery.ts`                              | Complete |
| `src/ports/sandbox-runner.port.ts` (`SandboxProgramContract`)   | Complete |
| `services/sandbox-runtime/agent/run.mjs`                        | Complete |
| `services/sandbox-runtime/Dockerfile`                           | Complete |
| `tests/stack/sandbox/sandbox-e2e.stack.test.ts`                 | Pending  |

#### Validation (2026-02-07)

E2E smoke test confirmed full pipeline operational:

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

---

### P1: Tool Execution Gateway

> **Scaling**: See [SANDBOX_SCALING.md](SANDBOX_SCALING.md) for proxy selection, per-run vs shared proxy tradeoffs, signed token scheme, and threat model.

**Trigger**: Agent needs to call external tools (file system, git, metrics, etc.) beyond just LLM.

**Scope**: Add tool execution to the existing LLM proxy, creating full CogniGateway.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX (network=none)                                              │
│ ──────────────────────                                              │
│  Agent Runtime                                                      │
│    ├─ LLM: http://localhost:8080/v1/* (from P0.5)                   │
│    └─ Tools: cogni-tool exec <tool> '<args-json>'                   │
│                                                                     │
│  socat (localhost:8080 ↔ /run/cogni-gateway.sock)                  │
└────────────────────────┼────────────────────────────────────────────┘
                         │ unix socket
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ HOST: CogniGateway (Node.js, replaces OSS proxy)                    │
│ ─────────────────────────────────────────────────                   │
│  /v1/* → LiteLLM proxy (same as P0.5)                               │
│  /tool/exec → toolRunner.exec() + policy + audit                    │
└─────────────────────────────────────────────────────────────────────┘
```

**Design Choice**: P1 replaces the OSS proxy with a Node.js CogniGateway that handles both LLM routing and tool execution. This is when we commit to bespoke gateway code.

#### Infrastructure

- [ ] Create `services/sandbox-runtime/cogni-tool/` CLI:
  - Reads gateway URL from `COGNI_GATEWAY_URL` env (default: `http://localhost:8080`)
  - Commands: `cogni-tool exec <tool> '<args-json>'`
  - Protocol: HTTP POST to `/tool/exec`
- [ ] Update Dockerfile to include `cogni-tool` binary

#### Adapters (`src/adapters/server/sandbox/`)

- [ ] Create `cogni-gateway.server.ts` (replaces llm-proxy-manager):
  - Listen on unix socket
  - `/v1/*` → proxy to LiteLLM with header injection (migrate from Envoy)
  - `/tool/exec` → validate runId, check allowlist, call toolRunner
  - Audit log all requests (no prompt content)
- [ ] Tool allowlist (P1 scope):
  - `core__get_current_time` — pure computation
  - `core__metrics_query` — read-only metrics
  - No authenticated tools yet (deferred to P1.5)

#### Merge Gates (P1)

- [ ] LLM routing still works (regression from P0.5)
- [ ] Tool execution via `cogni-tool exec` succeeds
- [ ] runId mismatch → rejected
- [ ] Tool not in allowlist → `policy_denied`
- [ ] All tool calls appear in host audit log

---

### P1.5: Authenticated Tools + Clawdbot Integration

**Trigger**: Agent needs to call authenticated external services (GitHub, Slack, etc.).

**Scope**: Integrate ConnectionBroker for credential resolution; add Clawdbot-specific configuration.

- [ ] Extend CogniGateway tool allowlist with authenticated tools
- [ ] Integrate ConnectionBroker for credential resolution (host-side)
- [ ] Clawdbot-specific config: `baseUrl: http://localhost:8080`, sandbox mode
- [ ] Implement `GitHubRepoAdapter` for `RepoPort` via ConnectionBroker
- [ ] Persistent workspace option for long-running DAO agents
- [ ] Stop using LITELLM_MASTER_KEY, find better proxy keys

---

### P2: Full Agent Autonomy (Do NOT Build Yet)

- [ ] Multi-turn agent sessions with persistent workspace
- [ ] `.cogni/index.json` repo memory
- [ ] Sandbox warm pools
- [ ] Condition: P0.5 and P1 must be boring first

---

## Design Decisions

### 1. Unix Socket Bridge over Docker Networking (P0.5)

**Decision**: Use `network=none` + mounted unix socket instead of internal Docker network for LLM access.

**P0.5a explored**: Internal Docker network (`sandbox-internal`) with `internal: true` to block internet while allowing LiteLLM access. This worked but required network connectivity.

**P0.5 uses**: Complete network isolation (`network=none`) with unix socket in a shared Docker volume. Proxy runs as nginx:alpine container on sandbox-internal network. A socat process in the sandbox bridges `localhost:8080` to the socket. Docker volumes (not bind mounts) are used for socket sharing — this avoids macOS osxfs unix socket issues and prevents tmpfs at `/run` from masking the mount.

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

### 2. OSS Proxy First, CogniGateway Later (P0.5 → P1)

**Decision**: P0.5 uses config-only OSS reverse proxy (Envoy or Nginx). P1 upgrades to Node.js CogniGateway when tool execution is needed.

**P0.5**: Envoy/Nginx with static config — header injection, forwarding, access logging. No code.

**P1**: Node.js CogniGateway — same LLM proxy + `/tool/exec` endpoint. Bespoke code justified by tool execution needs.

**Why OSS first**:

- Config-only is simpler to maintain and audit
- Avoids premature complexity
- Streaming/retry edge cases handled by battle-tested proxy
- Only accept bespoke code when we need programmable behavior (tools)

### 3. LiteLLM as Billing Truth (No Proxy Token Counting)

**Decision**: Do not count tokens in the proxy. LiteLLM is the authoritative billing source. `end_user = billingAccountId` everywhere (matches in-proc `LiteLlmAdapter`). Run correlation via `metadata.run_id`.

**Why**:

- Streaming + retries make proxy-side token counting brittle
- LiteLLM already tracks usage per `end_user`
- Sandbox bills inline: trusted proxy captures `x-litellm-call-id` per call → `usageUnitId`
- External executors (P1) reconcile via `GET /spend/logs?end_user=${billingAccountId}`, filter by `metadata.run_id`
- See [GRAPH_EXECUTOR_AUDIT.md](GRAPH_EXECUTOR_AUDIT.md) for inline vs reconciliation decision guide

### 4. Agent in Sandbox from P0.5 (Skip Host-Owned Loop)

**Decision**: Run the agent (OpenClaw, Clawdbot, etc.) inside the sandbox from P0.5. Skip the "host-owned LLM loop" design.

**Why**:

- Simpler architecture: agent is a black box, we just provide LLM access
- Faster path to running OpenClaw/Clawdbot
- Host-owned loop adds orchestration complexity without clear benefit
- Agent autonomy is constrained by network isolation + socket-only IO

### 5. No Tools or ConnectionBroker in P0.5

**Decision**: P0.5 provides LLM access only. No tool execution gateway, no ConnectionBroker.

**P0.5 scope**: Agent can call LLM. That's it. Agent uses its own built-in tools (file read/write, shell within workspace).

**P1 adds**: Tool execution gateway for external integrations.

**P1.5 adds**: Authenticated tools via ConnectionBroker.

**Why**: MVP should prove LLM loop works. Tools add complexity. Ship the minimal thing first.

### 6. Host-Side Clone + Push

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

---

## Anti-Patterns

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

---

## Merge Gates Summary

| Phase | Gate                    | Test                                                       |
| ----- | ----------------------- | ---------------------------------------------------------- |
| P0    | Network isolation       | `curl` from sandbox → fails                                |
| P0    | Workspace I/O           | Read/write `/workspace` from container + host              |
| P0    | Timeout handling        | Long command killed, `errorCode: 'timeout'`                |
| P0    | No orphans              | No containers left after test                              |
| P0.5a | LiteLLM reachable       | HTTP 200 from `http://litellm:4000/health` (internal net)  |
| P0.5a | No default route        | `ip route show default` returns empty                      |
| P0.5a | External DNS blocked    | `getent hosts example.com` fails                           |
| P0.5a | External IP blocked     | `curl http://1.1.1.1` fails                                |
| P0.5a | No Docker socket        | `/var/run/docker.sock` not present                         |
| P0.5a | Internal DNS works      | `getent hosts litellm` succeeds                            |
| P0.5  | Socket bridge works     | Sandbox reaches proxy `/health` via localhost:8080         |
| P0.5  | Proxy forwards          | Requests reach LiteLLM (connection test)                   |
| P0.5  | Network isolation       | Sandbox w/o proxy can't reach localhost:8080 or external   |
| P0.5  | No secrets in sandbox   | Container env has no `LITELLM_MASTER_KEY`/`OPENAI_API_KEY` |
| P0.5  | OPENAI_API_BASE set     | Container env points to `localhost:8080`                   |
| P0.5  | Header stripping        | Proxy handles spoofed headers without breaking             |
| P0.75 | E2E chat flow           | `POST /api/v1/ai/chat` with `sandbox:agent` → SSE response |
| P0.75 | Agent in catalog        | `GET /api/v1/ai/agents` includes `sandbox:agent`           |
| P0.75 | Billing verified        | `charge_receipts` has entry matching sandbox `runId`       |
| P0.75 | LiteLLM spend match     | `end_user` in spend logs matches `${runId}/0`              |
| P0.75 | Graceful failure        | Agent error → structured `GraphFinal.error`                |
| P1    | Tool exec works         | `cogni-tool exec <tool>` succeeds                          |
| P1    | Tool allowlist enforced | Disallowed tool → `policy_denied`                          |
| P1    | runId mismatch rejected | Wrong runId in request → rejected                          |

---

## Related Documents

- [OPENCLAW_SANDBOX_CONTROLS.md](OPENCLAW_SANDBOX_CONTROLS.md) — Git relay, dynamic catalog, dashboard, OpenClaw controls
- [SANDBOX_SCALING.md](SANDBOX_SCALING.md) — Proxy selection, shared proxy, signed tokens, threat model
- [OPENCLAW_SANDBOX_SPEC.md](OPENCLAW_SANDBOX_SPEC.md) — OpenClaw container image, config, I/O protocol
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution, DENY_BY_DEFAULT
- [RBAC_SPEC.md](RBAC_SPEC.md) — ExecutionGrant, allowSandbox gate
- [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) — ConnectionBroker (P1.5)

---

**Last Updated**: 2026-02-07
**Status**: P0 Complete, P0.5a Complete, P0.5 Complete, P0.75 Complete (E2E validated, automated tests pending)
