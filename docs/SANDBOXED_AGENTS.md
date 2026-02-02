# Sandboxed Agent System

> [!CRITICAL]
> Sandbox is a **GraphProvider** routed via `AggregatingGraphExecutor`. NOT user-invocable—requires system `ExecutionGrant` with `allowSandbox` gate. Secrets never enter sandbox. P0: host owns LLM loop. P0.5+: LLM calls via CogniGateway → host → LiteLLM.

## Core Invariants (All Phases)

1. **SANDBOX_IS_GRAPH_PROVIDER**: Sandbox implements `GraphProvider`, registered in `AggregatingGraphExecutor`.

2. **SYSTEM_GRANT_REQUIRED**: Requires `ExecutionGrant` with `allowSandbox: true`. NOT user-invocable.

3. **SECRETS_HOST_ONLY**: No tokens in sandbox FS/env/logs. Host resolves credentials.

4. **NETWORK_DEFAULT_DENY**: Sandbox runs `network=none`. All external IO via gateway only.

5. **HOST_SIDE_CLONE**: Host clones repo into workspace volume. Sandbox never has Git credentials.

6. **APPEND_ONLY_AUDIT**: All gateway traffic logged by host. Sandbox self-report not trusted.

7. **WRITE_PATH_IS_BRANCH**: Push to branch by default. PR creation only when explicitly requested.

## P0.5+ Invariants

8. **LLM_VIA_GATEWAY_ONLY**: Sandbox calls LLM ONLY via CogniGateway → host → LiteLLM. Never run models in-sandbox.

9. **HOST_INJECTS_BILLING_HEADER**: Gateway injects `x-litellm-end-user-id: ${runId}/${attempt}`. Client-sent headers ignored.

---

## Phase Definitions

| Phase    | LLM Location | Gateway      | Description                                                  |
| -------- | ------------ | ------------ | ------------------------------------------------------------ |
| **P0**   | Host         | ToolGateway  | Host owns LLM loop. Sandbox is command executor.             |
| **P0.5** | Sandbox      | CogniGateway | Agent in sandbox calls LLM via gateway. No auth tools.       |
| **P1**   | Sandbox      | CogniGateway | Clawdbot runtime + authenticated tools via ConnectionBroker. |

> **Confusion Avoidance**: If LLM calls originate inside sandbox, that's P0.5+, not P0.

---

## Implementation Checklist

### P0: Host-Owned LLM Loop

Host owns LLM loop via LiteLLM. Sandbox is command executor only (no LLM calls from sandbox).

#### Infrastructure

- [ ] Create `services/sandbox-runtime/Dockerfile`:
  - Base: `node:20-slim`
  - Install: git (for local ops), pnpm, jq, rg, fd-find, bash
  - Copy: `cogni-tool` CLI
  - No autonomous entrypoint — container receives commands via gateway
- [ ] Create `services/sandbox-runtime/cogni-tool/` CLI:
  - Reads socket path from `COGNI_GATEWAY_SOCK` env
  - Commands: `cogni-tool exec <tool> '<args-json>'`
  - Protocol: JSON over unix socket
- [ ] Add `sandbox-isolated` network to docker-compose (no external connectivity)

#### Ports (`src/ports/`)

- [ ] Create `src/ports/sandbox-runner.port.ts`:
  ```typescript
  interface SandboxRunnerPort {
    execCommand(spec: SandboxCommandSpec): Promise<SandboxCommandResult>;
  }
  interface SandboxCommandSpec {
    runId: string;
    workspacePath: string; // Pre-cloned by host
    command: { type: "exec" | "read" | "write"; args: Record<string, unknown> };
    limits: { maxRuntimeSec: number; maxMemoryMb: number };
  }
  interface SandboxCommandResult {
    ok: boolean;
    output?: string;
    errorCode?: "timeout" | "oom_killed" | "internal" | "command_failed";
  }
  ```
- [ ] Create `src/ports/repo.port.ts`:
  ```typescript
  interface RepoPort {
    cloneToWorkspace(params: { repoUrl; sha; workspacePath }): Promise<void>;
    pushBranchFromPatches(params: {
      repoUrl;
      baseSha;
      patches;
      branchName;
    }): Promise<{ branchName }>;
    openPullRequest(params: {
      repoUrl;
      sourceBranch;
      targetBranch;
      title;
      body;
    }): Promise<{ prUrl }>;
  }
  ```

#### Adapters (`src/adapters/server/sandbox/`)

- [ ] Create `tool-gateway.server.ts`:
  - Unix socket at `/tmp/cogni-gateway-{runId}.sock`
  - Accept JSON `{runId, toolName, args, toolCallId}`
  - Validate runId matches expected
  - Call `toolRunner.exec()` with policy from run config
  - Return `{ok, value?, errorCode?, safeMessage?}`
  - Log all calls to audit stream
- [ ] Create `sandbox-runner.adapter.ts`:
  - Implements `SandboxRunnerPort`
  - Start gateway server before container
  - `docker run --rm --network=none --memory={limit}m`
  - Volume mounts: workspace (rw), gateway socket, artifacts dir
  - Env: `COGNI_GATEWAY_SOCK`, `RUN_ID`
  - Wait for exit or timeout (SIGKILL on timeout)
  - Collect patches from `/artifacts/`
  - Collect audit log from gateway
  - Cleanup socket + container
- [ ] Create `sandbox.provider.ts`:
  - Implements `GraphProvider`
  - `providerId: 'sandbox'`
  - `canHandle(graphId)`: true for `sandbox:*`
  - `runGraph()`:
    1. Validate grant has `allowSandbox: true`
    2. Call `repoPort.cloneToWorkspace()` (host-side clone)
    3. **Host runs LLM loop**, generates commands
    4. Call `sandboxRunner.execCommand()` for each command
    5. Feed results back to LLM, repeat until done
    6. Collect patches, optionally push branch
    7. Return `GraphRunResult` (stream + final)

#### Bootstrap (`src/bootstrap/`)

- [ ] Wire `SandboxRunnerPort` in `container.ts`
- [ ] Wire `RepoPort` stub in `container.ts` (GitHub impl P1)
- [ ] Add `SandboxGraphProvider` to `AggregatingGraphExecutor` in `graph-executor.factory.ts`
- [ ] Add `SANDBOX_ENABLED` feature flag (default false)
- [ ] Add `allowSandbox` field to `ExecutionGrant` schema

#### Temporal Integration

- [ ] Create `sandbox-agent-run.workflow.ts` following existing `GovernanceScheduledRunWorkflow` pattern:
  - Activity: `validateGrantActivity` (check `allowSandbox: true`)
  - Activity: `executeGraphActivity` with `graphId: 'sandbox:task'`
  - Activity: `pushBranchActivity` (optional)
  - Activity: `recordRunCompleteActivity`

#### Tests (Merge Gates)

- [ ] **Network isolation**: `curl` from sandbox fails (network=none enforced)
- [ ] **Grant gate**: Invocation without `allowSandbox: true` returns `authz_denied`
- [ ] **Gateway enforcement**: runId mismatch rejected, tool allowlist enforced
- [ ] **Audit completeness**: All tool calls appear in host-written `auditLog`
- [ ] **E2E flow**: clone@sha → edit → test → push branch works

#### Chores

- [ ] Observability: `sandbox.run.*` Prometheus metrics
- [ ] Documentation updates

### P0.5: CogniGateway LLM Routing

**Trigger**: When agent runtime inside sandbox needs to call LLM itself.

**Scope**: Extend ToolGateway to proxy LLM calls.

#### CogniGateway Contract

- Expose `/v1/*` (LLM) + `/tool/exec` over localhost in sandbox
- Forward over mounted unix socket to host
- Host injects `x-litellm-end-user-id: ${runId}/${attempt}` (ignore client-sent)
- Redact + audit all LLM/tool traffic at host

#### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX (network=none)                                              │
│ ──────────────────────                                              │
│  Agent Runtime (Clawdbot, etc.)                                     │
│    ├─ LLM: http://localhost:8080/v1/chat/completions                │
│    └─ Tools: cogni-tool exec <tool> <args>                          │
│                                                                     │
│  cogni-gateway-sidecar (localhost:8080 + unix socket)               │
└────┼────────────────────────────────────────────────────────────────┘
     │ unix socket to host
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ HOST: CogniGatewayServer                                            │
│ ─────────────────────────                                           │
│  /v1/* → LiteLLM proxy + inject x-litellm-end-user-id + audit       │
│  /tool/exec → toolRunner.exec() + policy + audit                    │
└─────────────────────────────────────────────────────────────────────┘
```

#### Implementation

- [ ] Extend `tool-gateway.server.ts` → `cogni-gateway.server.ts`
- [ ] Add `/v1/chat/completions` handler:
  - Validate runId from socket context
  - Inject `x-litellm-end-user-id: ${runId}/${attempt}`
  - Forward to LiteLLM (host-side)
  - Audit log (model, tokens, cost)
  - Support streaming
- [ ] Create `cogni-gateway-sidecar` for in-container forwarding
- [ ] Update sandbox Dockerfile to include sidecar

#### Merge Gates (P0.5)

- [ ] `curl google.com` from sandbox fails
- [ ] LLM request reaches LiteLLM with injected `end-user-id`
- [ ] Usage headers/logs attribute to runId
- [ ] No secrets in sandbox logs/artifacts

### P1: Clawdbot Agent Runtime + Authenticated Tools

- [ ] Clawdbot runs inside sandbox, uses CogniGateway for LLM
- [ ] Clawdbot config: `baseUrl: http://localhost:8080` (gateway sidecar)
- [ ] Implement `GitHubRepoAdapter` for `RepoPort` via ConnectionBroker
- [ ] Add authenticated tools via ConnectionBroker integration
- [ ] Persistent workspace option for long-running DAO agents

### P2: Full Agent Autonomy (Do NOT Build Yet)

- [ ] Multi-turn Clawdbot sessions with persistent workspace
- [ ] `.cogni/index.json` repo memory
- [ ] Sandbox warm pools
- [ ] Condition: P0 and P1 must be boring first

---

## File Pointers (P0)

| File                                                                    | Change                                 |
| ----------------------------------------------------------------------- | -------------------------------------- |
| `src/ports/sandbox-runner.port.ts`                                      | New: `SandboxRunnerPort` interface     |
| `src/ports/repo.port.ts`                                                | New: `RepoPort` interface              |
| `src/ports/index.ts`                                                    | Export new ports                       |
| `src/adapters/server/sandbox/tool-gateway.server.ts`                    | New: unix socket gateway               |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`                 | New: Docker runner                     |
| `src/adapters/server/sandbox/sandbox.provider.ts`                       | New: GraphProvider impl                |
| `src/adapters/server/sandbox/index.ts`                                  | Barrel export                          |
| `src/adapters/server/index.ts`                                          | Export sandbox adapters                |
| `src/bootstrap/container.ts`                                            | Wire ports                             |
| `src/bootstrap/graph-executor.factory.ts`                               | Add SandboxGraphProvider to aggregator |
| `services/sandbox-runtime/Dockerfile`                                   | New: sandbox image                     |
| `services/sandbox-runtime/cogni-tool/`                                  | New: gateway CLI                       |
| `services/scheduler-worker/src/workflows/sandbox-agent-run.workflow.ts` | New: Temporal workflow                 |
| `platform/infra/services/runtime/docker-compose.yml`                    | Add sandbox-isolated network           |
| `src/shared/db/schema.grants.ts`                                        | Add `allowSandbox` field               |

---

## Design Decisions

### 1. Host Owns LLM Loop (P0)

**Decision**: Host-side GraphProvider runs the LLM conversation loop. Sandbox executes commands only.

```
┌─────────────────────────────────────────────────────────────────────┐
│ HOST: SandboxGraphProvider.runGraph()                               │
│ ─────────────────────────────────────                               │
│ 1. Validate grant (allowSandbox: true)                              │
│ 2. Clone repo to workspace (host-side)                              │
│ 3. LLM loop:                                                        │
│    - Send task to LLM                                               │
│    - LLM returns commands (read file, edit, run test, etc.)         │
│    - Execute commands in sandbox via gateway                        │
│    - Return results to LLM                                          │
│    - Repeat until done                                              │
│ 4. Collect patches from sandbox                                     │
│ 5. Push branch (if configured)                                      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ commands via gateway
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX: Command Executor (network=none)                            │
│ ────────────────────────────────────────                            │
│ - Receives commands via unix socket gateway                         │
│ - Executes: file read/write, pnpm test, git commit                  │
│ - Returns results to host                                           │
│ - No LLM, no autonomous loop                                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Why**: Keeps P0 simple. Host controls all LLM I/O, billing, and orchestration. Sandbox is a pure command executor with no autonomy.

### 2. P0.5+: Agent Runtime Inside Sandbox

**Decision**: Agent runtime (any, including Clawdbot) runs inside sandbox via CogniGateway.

```
P0.5+:
┌─────────────────────────────────────────────────────────────────────┐
│ SANDBOX: Agent Runtime (network=none)                               │
│ ─────────────────────────────────────                               │
│ - Agent runs as process (Clawdbot, custom, etc.)                    │
│ - LLM: http://localhost:8080 → CogniGateway → host LiteLLM          │
│ - Tools: cogni-tool exec → CogniGateway → host toolRunner           │
│ - Autonomous within sandbox, but all IO through gateway             │
└─────────────────────────────────────────────────────────────────────┘
```

**Why P1 uses Clawdbot**: Already has sandbox mode, skill persistence, workspace management. Reuse rather than rebuild.

### 3. No ConnectionBroker in P0

**Decision**: P0 tools are non-auth read-only only. No `ConnectionBrokerPort` integration.

**P0 Tool Allowlist**:

- `core__get_current_time` — pure computation
- `core__metrics_query` — read-only metrics (if configured)

**P1 adds authenticated tools** via ConnectionBroker.

**Why**: Simplifies P0. Auth tools require broker, grant intersection, credential resolution — all deferred.

### 4. Host-Side Clone + Push

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

| Pattern                     | Problem                                     |
| --------------------------- | ------------------------------------------- |
| LLM calls from sandbox (P0) | P0 = host owns LLM loop. Use P0.5+ for this |
| GitHub token in sandbox env | Credential exfiltration risk                |
| Clone inside sandbox        | Needs credentials; clone on host            |
| Direct network from sandbox | Bypasses gateway policy, no audit           |
| Auth tools before P1        | Requires ConnectionBroker; defer to P1      |
| Auto-PR every run           | Noisy, no review gate                       |
| Shell tool in gateway       | Escapes all policy                          |
| Sandbox self-reported audit | Can't trust; host must write audit          |
| runId from sandbox input    | Must be host-generated                      |
| Wire into user chat API     | Must require system grant                   |

---

## Merge Gates (P0)

| Gate                   | Test                                          |
| ---------------------- | --------------------------------------------- |
| Network isolation      | `curl google.com` from sandbox → fails        |
| Grant enforcement      | Missing `allowSandbox: true` → `authz_denied` |
| Gateway runId check    | Wrong runId → rejected                        |
| Gateway tool allowlist | Disallowed tool → `policy_denied`             |
| Audit is host-written  | All gateway calls logged by host              |
| E2E flow               | clone@sha → edit → test → push branch         |

---

## Related Documents

- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, billing
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution, DENY_BY_DEFAULT
- [CLAWDBOT_ADAPTER_SPEC.md](CLAWDBOT_ADAPTER_SPEC.md) — Clawdbot runtime (P0.5+ agent option)
- [RBAC_SPEC.md](RBAC_SPEC.md) — ExecutionGrant, allowSandbox gate
- [TENANT_CONNECTIONS_SPEC.md](TENANT_CONNECTIONS_SPEC.md) — ConnectionBroker (P1)

---

**Last Updated**: 2026-02-02
**Status**: Draft
