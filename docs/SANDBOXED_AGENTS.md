# Sandboxed Agent System

> [!CRITICAL]
> Sandbox is a **GraphProvider** routed via `AggregatingGraphExecutor`. NOT user-invocable—requires system `ExecutionGrant` with `allowSandbox` gate. Secrets never enter sandbox. All LLM calls via unix-socket proxy on host.

## Core Invariants (All Phases)

1. **SANDBOX_IS_GRAPH_PROVIDER**: Sandbox implements `GraphProvider`, registered in `AggregatingGraphExecutor`.

2. **SYSTEM_GRANT_REQUIRED**: Requires `ExecutionGrant` with `allowSandbox: true`. NOT user-invocable.

3. **SECRETS_HOST_ONLY**: No tokens in sandbox FS/env/logs. Host proxy resolves credentials.

4. **NETWORK_DEFAULT_DENY**: Sandbox runs `network=none` always. All external IO via mounted unix socket only.

5. **HOST_SIDE_CLONE**: Host clones repo into workspace volume. Sandbox never has Git credentials.

6. **APPEND_ONLY_AUDIT**: All proxy traffic logged by host. Sandbox self-report not trusted.

7. **WRITE_PATH_IS_BRANCH**: Push to branch by default. PR creation only when explicitly requested.

## P0.5+ Invariants

8. **LLM_VIA_SOCKET_ONLY**: Sandbox calls LLM ONLY via `localhost:8080 → unix socket → host proxy → LiteLLM`. No network access.

9. **HOST_INJECTS_BILLING_HEADER**: Proxy injects `x-litellm-end-user-id: ${runId}/${attempt}`. Client-sent headers stripped/ignored.

10. **LITELLM_IS_BILLING_TRUTH**: Do not count tokens in proxy. LiteLLM `/spend/logs` is the authoritative billing source. Reconcile later via `end_user` query.

---

## Phase Definitions

| Phase     | Network Mode | LLM Access                | Description                                                  |
| --------- | ------------ | ------------------------- | ------------------------------------------------------------ |
| **P0**    | none         | N/A                       | Spike: prove network isolation + workspace I/O               |
| **P0.5a** | internal     | Direct (unauthenticated)  | Spike: prove LiteLLM reachable via internal network          |
| **P0.5**  | none         | unix socket → OSS proxy   | Agent in sandbox, LLM via socket bridge. No tools.           |
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
    command: string; // Passed to bash -c
    limits: { maxRuntimeSec: number; maxMemoryMb: number };
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
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX (network=none)                                              │
│ ──────────────────────                                              │
│  Agent Runtime (OpenClaw, Clawdbot, etc.)                           │
│    └─ OPENAI_API_BASE=http://localhost:8080                         │
│                                                                     │
│  socat/sidecar (localhost:8080 ↔ /run/llm-proxy.sock)              │
└────────────────────────┼────────────────────────────────────────────┘
                         │ /run/llm-proxy.sock (mounted from host)
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ HOST: Envoy/Nginx Proxy (listens on unix socket)                    │
│ ────────────────────────────────────────────────                    │
│  - Strips client x-litellm-end-user-id header                       │
│  - Injects: Authorization: Bearer ${LITELLM_MASTER_KEY}             │
│  - Injects: x-litellm-end-user-id: ${runId}/${attempt}              │
│  - Forwards to http://litellm:4000                                  │
│  - Audit logs: runId, model, timestamp (no prompts)                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Design Choice**: Use OSS reverse proxy (Envoy or Nginx) for host-side proxy. Config-only, no bespoke code. Only build a Node proxy if committing to full CogniGateway.

#### Infrastructure

- [ ] Create `platform/infra/services/sandbox-proxy/` with Envoy or Nginx config:
  - Listen on unix socket: `/tmp/llm-proxy-{runId}.sock`
  - Strip incoming `x-litellm-end-user-id` header
  - Inject `Authorization: Bearer ${LITELLM_MASTER_KEY}` (from env)
  - Inject `x-litellm-end-user-id: ${runId}/${attempt}` (from config/env)
  - Forward to `http://litellm:4000`
  - Access log: timestamp, runId, model, status (no request body)
- [ ] Update `services/sandbox-runtime/Dockerfile`:
  - Add `socat` for socket-to-localhost bridging
  - Add entrypoint wrapper that starts socat before main command
- [ ] Create `services/sandbox-runtime/entrypoint.sh`:
  - Start `socat TCP-LISTEN:8080,fork UNIX-CONNECT:/run/llm-proxy.sock &`
  - Exec the main agent command

#### Adapters (`src/adapters/server/sandbox/`)

- [ ] Extend `SandboxRunnerAdapter.runOnce()`:
  - Before container start: spawn Envoy/Nginx proxy process with socket path
  - Mount socket: `/tmp/llm-proxy-{runId}.sock:/run/llm-proxy.sock:ro`
  - Set env: `OPENAI_API_BASE=http://localhost:8080`, `RUN_ID=${runId}`
  - After container exits: stop proxy, collect access logs for audit
- [ ] Create `src/adapters/server/sandbox/llm-proxy-manager.ts`:
  - `start(runId, attempt)`: spawn proxy, return socket path
  - `stop(runId)`: kill proxy, return access log path
  - Config injection via env or template file

#### Bootstrap (`src/bootstrap/`)

- [ ] Wire `SandboxRunnerPort` in `container.ts`
- [ ] Add `SANDBOX_ENABLED` feature flag (default false)
- [ ] Add `allowSandbox` field to `ExecutionGrant` schema

#### Tests (Merge Gates)

- [ ] **Network isolation**: Sandbox cannot reach `litellm` by DNS/IP (network=none); only `localhost:8080` works
- [ ] **LLM completion succeeds**: `/v1/chat/completions` returns valid response via proxy
- [ ] **Auth injection**: Proxy logs show `Authorization` header added (not in sandbox)
- [ ] **Attribution injection**: LiteLLM receives `x-litellm-end-user-id: {runId}/{attempt}`
- [ ] **Header stripping**: Client-sent `x-litellm-end-user-id` is ignored/overridden
- [ ] **Audit logging**: Proxy logs show runId + model + timestamp; no secrets/prompts logged
- [ ] **No secrets in sandbox**: Container env/logs contain no `LITELLM_MASTER_KEY`

#### File Pointers (P0.5)

| File                                                       | Status  |
| ---------------------------------------------------------- | ------- |
| `platform/infra/services/sandbox-proxy/envoy.yaml`         | Pending |
| `services/sandbox-runtime/Dockerfile`                      | Update  |
| `services/sandbox-runtime/entrypoint.sh`                   | Pending |
| `src/adapters/server/sandbox/llm-proxy-manager.ts`         | Pending |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`    | Update  |
| `tests/stack/sandbox/sandbox-llm-completion.stack.test.ts` | Pending |

---

### P1: Tool Execution Gateway

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

**P0.5 uses**: Complete network isolation (`network=none`) with unix socket mounted from host. A socat sidecar bridges `localhost:8080` to the socket.

```
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX (network=none)                                              │
│                                                                     │
│  Agent → localhost:8080 → socat → /run/llm-proxy.sock              │
└──────────────────────────────┼──────────────────────────────────────┘
                               │ unix socket (mounted)
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ HOST: Envoy/Nginx → litellm:4000                                    │
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

**Decision**: Do not count tokens in the proxy. Inject `x-litellm-end-user-id` header and use LiteLLM `/spend/logs` as authoritative billing source.

**Why**:

- Streaming + retries make proxy-side token counting brittle
- LiteLLM already tracks usage per `end_user`
- Reconciliation via `GET /spend/logs?end_user=${runId}/${attempt}` is reliable
- MVP should prove the loop first, optimize billing accuracy later

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

| Phase | Gate                      | Test                                                      |
| ----- | ------------------------- | --------------------------------------------------------- |
| P0    | Network isolation         | `curl` from sandbox → fails                               |
| P0    | Workspace I/O             | Read/write `/workspace` from container + host             |
| P0    | Timeout handling          | Long command killed, `errorCode: 'timeout'`               |
| P0    | No orphans                | No containers left after test                             |
| P0.5a | LiteLLM reachable         | HTTP 200 from `http://litellm:4000/health` (internal net) |
| P0.5a | No default route          | `ip route show default` returns empty                     |
| P0.5a | External DNS blocked      | `getent hosts example.com` fails                          |
| P0.5a | External IP blocked       | `curl http://1.1.1.1` fails                               |
| P0.5a | No Docker socket          | `/var/run/docker.sock` not present                        |
| P0.5a | Internal DNS works        | `getent hosts litellm` succeeds                           |
| P0.5  | Network=none enforced     | Sandbox cannot reach litellm by DNS/IP; only localhost    |
| P0.5  | LLM completion via socket | `/v1/chat/completions` returns valid response             |
| P0.5  | Auth header injected      | Proxy adds `Authorization` (not visible in sandbox)       |
| P0.5  | Attribution injected      | LiteLLM receives `x-litellm-end-user-id: runId/attempt`   |
| P0.5  | Client header stripped    | Client-sent `x-litellm-end-user-id` is ignored            |
| P0.5  | Audit logged by host      | Proxy logs: runId, model, timestamp (no prompts)          |
| P0.5  | No secrets in sandbox     | Container env/logs have no `LITELLM_MASTER_KEY`           |
| P1    | Tool exec works           | `cogni-tool exec <tool>` succeeds                         |
| P1    | Tool allowlist enforced   | Disallowed tool → `policy_denied`                         |
| P1    | runId mismatch rejected   | Wrong runId in request → rejected                         |

---

## Related Documents

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution, DENY_BY_DEFAULT
- [CLAWDBOT_ADAPTER_SPEC.md](CLAWDBOT_ADAPTER_SPEC.md) — Clawdbot runtime (P1+ agent option)
- [RBAC_SPEC.md](RBAC_SPEC.md) — ExecutionGrant, allowSandbox gate
- [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) — ConnectionBroker (P1.5)

---

**Last Updated**: 2026-02-06
**Status**: P0 Complete, P0.5a Complete (spike), P0.5 In Progress
