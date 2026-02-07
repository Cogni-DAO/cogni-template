# OpenClaw Sandbox Integration Spec

> [!CRITICAL]
> OpenClaw runs **inside** the Cogni sandbox (`network=none`). LLM calls route through the unix-socket proxy — OpenClaw never touches API keys or the network. OpenClaw's own sandbox and cron are **disabled**; Cogni is the sandbox and Temporal is the scheduler. Supersedes the former `CLAWDBOT_ADAPTER_SPEC.md`.

## Core Invariants

> Numbering continues from [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) invariants 1–12.

13. **OPENCLAW_SANDBOX_OFF**: OpenClaw's built-in sandbox (`sandbox.mode`) is always `"off"` inside Cogni's container. The Cogni sandbox IS the isolation boundary. Docker is not available inside the container; enabling OpenClaw's sandbox would hard-fail on `docker create`.

14. **OPENCLAW_CRON_DISABLED**: OpenClaw's cron scheduler (`cron.enabled`) is always `false`. Temporal is scheduler-of-record (same as SANDBOXED_AGENTS.md invariant). Duplicate schedulers cause billing surprises and audit gaps.

15. **OPENCLAW_ELEVATED_DISABLED**: OpenClaw's elevated tool mode (`tools.elevated.enabled`) is always `false`. Elevated mode bypasses tool policy and would collapse the sandbox security boundary.

16. **COGNI_IS_MODEL_ROUTER**: OpenClaw's model providers are set to `mode: "replace"` with a single `cogni` provider pointing at `http://localhost:8080/v1`. All built-in providers (Anthropic, OpenAI, Google, etc.) are stripped. OpenClaw cannot reach them anyway (`network=none`), and leaving them configured causes confusing fallback behavior and auth resolution attempts.

17. **NO_OPENCLAW_GATEWAY**: OpenClaw runs in embedded/local agent mode only (`--local`). The gateway service is never started inside the sandbox. Gateway mode requires network listeners and persistent state that conflict with one-shot container semantics.

18. **NO_OPENCLAW_DASHBOARD**: OpenClaw's Control UI and bridge port are not exposed. No dashboard proxying until P2+ at earliest. The proxy only serves `/v1/*` (LLM) and `/health`.

19. **ONE_RUN_ONE_SESSION**: Each `SandboxRunnerAdapter.runOnce()` invocation is a fresh OpenClaw session. Session state does not persist across runs. Conversation history, if needed, is injected via workspace files (see [Agent I/O Protocol](#agent-io-protocol)).

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│ SandboxGraphProvider                                                    │
│  1. Create tmp workspace, write .cogni/prompt.txt + openclaw.json      │
│  2. SandboxRunnerAdapter.runOnce({ image: openclaw, llmProxy: ... })   │
│  3. Parse stdout JSON → emit AiEvents                                  │
│  4. Reconcile billing via LiteLLM /spend/logs                          │
└──────────────────┬────────────────────────────────────────────────────┘
                   ▼
┌───────────────────────────────────────────────────────────────────────┐
│ SANDBOX CONTAINER: cogni-sandbox-openclaw (network=none)                │
│ ────────────────────────────────────────                                │
│  HOME=/workspace  OPENCLAW_CONFIG_PATH=/workspace/.openclaw/openclaw.json│
│                                                                         │
│  node /app/dist/index.js agent --local --agent main                    │
│       --message "$(cat /workspace/.cogni/prompt.txt)"                  │
│       --session-id ${RUN_ID} --json --timeout ${TIMEOUT}               │
│                                                                         │
│  OpenClaw Pi agent runtime (autonomous multi-turn tool loop):          │
│    → POST /v1/chat/completions { model: "gemini-2.5-flash", ... }     │
│    ← tool_calls → execute locally (bash, read, write, edit)            │
│    → POST /v1/chat/completions { tool_results, ... }                   │
│    ← ... repeat until text-only response ...                           │
│                                                                         │
│  socat (localhost:8080 ↔ /llm-sock/llm.sock)                          │
│  Mounts: llm-socket-{runId} volume → /llm-sock (rw, socket connect)  │
│          workspace/ → /workspace (read-write, bind mount)             │
└──────────────────────┼────────────────────────────────────────────────┘
                       │ sock/ directory (Docker volume)
                       ▼
┌───────────────────────────────────────────────────────────────────────┐
│ PROXY: nginx:alpine (sandbox-internal network)                          │
│  Injects: Authorization: Bearer ${LITELLM_MASTER_KEY}                  │
│  Injects: x-litellm-end-user-id: ${billingAccountId}                  │
│  Injects: x-litellm-spend-logs-metadata: { run_id, attempt, graph_id, ... }     │
│  Forwards: http://litellm:4000                                         │
│  Audit log: timestamp, runId, model, status (no prompts)               │
└───────────────────────────────────────────────────────────────────────┘
```

**Key insight**: OpenClaw may make **many** LLM calls per sandbox run (one per tool-use turn). Every call transits the proxy. Every call gets billing headers injected. LiteLLM tracks all calls under the same `billingAccountId`, filtered by `metadata.run_id` for per-run reconciliation. We never count tokens ourselves.

---

## LLM API Protocol

OpenClaw speaks standard **OpenAI Chat Completions** (`/v1/chat/completions`) via its `api: "openai-completions"` provider mode.

### Request Flow (per LLM turn)

```
OpenClaw runtime
  │  POST http://localhost:8080/v1/chat/completions
  │  Headers: Authorization: Bearer proxy-handles-auth  (ignored by proxy)
  │           Content-Type: application/json
  │  Body: {
  │    "model": "gemini-2.5-flash",        ← LiteLLM alias, from openclaw.json
  │    "messages": [...],                   ← OpenClaw manages conversation
  │    "tools": [...],                      ← OpenClaw's tool definitions
  │    "stream": true                       ← OpenClaw streams by default
  │  }
  ▼
socat (localhost:8080 → /llm-sock/llm.sock)
  ▼
nginx proxy (overwrites all auth/billing headers)
  │  Authorization: Bearer ${LITELLM_MASTER_KEY}
  │  x-litellm-end-user-id: ${billingAccountId}
  │  x-litellm-spend-logs-metadata: {"run_id":"...","attempt":0,"graph_id":"sandbox:agent",...}
  ▼
LiteLLM (litellm:4000)
  │  Resolves model alias → OpenRouter upstream
  ▼
OpenRouter → upstream provider (Anthropic, Google, OpenAI, etc.)
```

### What OpenClaw Sends

OpenClaw's `openai-completions` API mode sends standard requests:

- `POST /v1/chat/completions` with `stream: true`
- Tool definitions in the `tools` array (OpenAI function-calling format)
- Conversation history managed by OpenClaw's Pi runtime
- Model name matches the `id` field from the `cogni` provider's `models` array

### What Our Proxy Does

Per the existing nginx template (unchanged from P0.5):

- **Overwrites** `Authorization` header with `Bearer ${LITELLM_MASTER_KEY}`
- **Overwrites** `x-litellm-end-user-id` with `${billingAccountId}`
- **Overwrites** `x-litellm-spend-logs-metadata` with run correlation JSON
- **Forwards** to `http://litellm:4000` (Docker DNS)
- **Streams** SSE responses back (`proxy_buffering off`, `proxy_read_timeout 300s`)
- **Logs** each request (timestamp, model, status, latency — no prompts)

### What OpenClaw Receives

Standard OpenAI SSE streaming response. OpenClaw's Pi runtime parses `tool_calls` from the response, executes tools locally inside the container, appends tool results to the conversation, and calls the LLM again. This loop repeats until the LLM returns a text-only response (no more tool calls).

### Routes Used

| Route                       | Used by OpenClaw                 | Purpose                                                    |
| --------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `POST /v1/chat/completions` | Yes                              | All LLM calls                                              |
| `GET /v1/models`            | Possibly (model discovery)       | Proxy forwards all methods on `/v1/`; LiteLLM handles this |
| `GET /health`               | No (socat bridges, not OpenClaw) | Proxy health check                                         |
| `POST /v1/responses`        | No                               | Would require `api: "openai-responses"`                    |

> **Open Question**: Does OpenClaw's `openai-completions` mode ever call `/v1/models` for discovery? If so, LiteLLM supports this endpoint and it would work. But we pre-configure the model list in `openclaw.json`, so discovery should be unnecessary. Needs verification.

---

## Container Image

### Image: `cogni-sandbox-openclaw`

A multi-stage build that copies OpenClaw's runtime into a slim base with our sandbox entrypoint.

```dockerfile
# ── Stage 1: OpenClaw build (reuse existing openclaw:local) ──
FROM openclaw:local AS openclaw-build

# ── Stage 2: Slim runtime ──
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git jq curl socat bash ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy built OpenClaw runtime (dist + node_modules + package.json)
COPY --from=openclaw-build /app/dist /app/dist
COPY --from=openclaw-build /app/node_modules /app/node_modules
COPY --from=openclaw-build /app/package.json /app/package.json
COPY --from=openclaw-build /app/ui/dist /app/ui/dist
COPY --from=openclaw-build /app/docs/reference/templates /app/docs/reference/templates
COPY --from=openclaw-build /app/skills /app/skills

# Sandbox entrypoint (socat bridge + exec)
COPY entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh
RUN chmod 755 /usr/local/bin/sandbox-entrypoint.sh

# Non-root user matching SandboxRunnerAdapter (hardcodes User: "sandboxer")
RUN groupadd -g 1001 sandboxer && useradd -u 1001 -g sandboxer -m sandboxer
USER sandboxer
WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint.sh"]
```

> **Open Question**: The exact set of files needed from `openclaw:local` needs validation. Specifically: does OpenClaw's runtime reference `skills/` at startup, or only when a skill is invoked? Does it need `ui/dist/` for embedded mode? The multi-stage COPY list above is a best guess — needs testing to find the minimal set. Expected final image size: ~500MB–1.5GB (vs 4GB for `openclaw:local`).

### Entrypoint

Reuses the existing `sandbox-entrypoint.sh` pattern from P0.5 (starts socat, then execs the command). No changes needed — the entrypoint already bridges `localhost:8080 → /llm-sock/llm.sock` and runs `bash -lc "$@"`.

### ReadonlyRootfs Compatibility

The `SandboxRunnerAdapter` sets `ReadonlyRootfs: true` with tmpfs at `/tmp` (64m) and `/run` (8m). OpenClaw needs writable paths controlled via env:

- **`/workspace/.openclaw/`** — config file (`OPENCLAW_CONFIG_PATH`) → on workspace bind mount (rw), OK
- **`/workspace/.openclaw-state/`** — sessions, transcripts, caches (`OPENCLAW_STATE_DIR`) → on workspace bind mount (rw), OK
- **`/workspace/`** — `HOME=/workspace` ensures any `$HOME` writes go to writable mount, not readonly rootfs

**Resolved (OQ-8)**: OpenClaw's `resolveStateDir()` defaults to `$HOME/.openclaw` if `OPENCLAW_STATE_DIR` is not set. Setting `OPENCLAW_STATE_DIR=/workspace/.openclaw-state` and `HOME=/workspace` prevents all writes to readonly paths. Verified in `src/config/paths.ts:49-74`.

---

## OpenClaw Configuration

The `SandboxGraphProvider` generates this config and writes it to `/workspace/.openclaw/openclaw.json` before each run.

### Base Config (invariant across all runs)

```json5
{
  // ── Agent defaults ──
  agents: {
    defaults: {
      model: {
        primary: "cogni/${MODEL_ID}", // set per-run from GraphRunRequest
      },
      workspace: "/workspace", // container workspace root
      sandbox: { mode: "off" }, // invariant 13: OPENCLAW_SANDBOX_OFF
      skipBootstrap: true, // we pre-create workspace files
      timeoutSeconds: 540, // < container timeout (600s) for clean exit
    },
    list: [
      {
        id: "main",
        default: true,
        workspace: "/workspace",
      },
    ],
  },

  // ── Model routing ──
  models: {
    mode: "replace", // invariant 16: strip all built-in providers
    providers: {
      cogni: {
        baseUrl: "http://localhost:8080/v1", // socat → socket → proxy → LiteLLM
        apiKey: "proxy-handles-auth", // overwritten by proxy, value is irrelevant
        api: "openai-completions",
        models: [
          // ── generated at runtime from LiteLLM config ──
          // see "Model Catalog Sync" section
        ],
      },
    },
  },

  // ── Tool policy ──
  tools: {
    elevated: { enabled: false }, // invariant 15: OPENCLAW_ELEVATED_DISABLED
    deny: [
      "group:web", // web_fetch, web_search — no network
      "browser", // Chrome CDP — no network, no display
      "cron", // invariant 14: OPENCLAW_CRON_DISABLED
      "gateway", // no gateway running
      "nodes", // no device mesh
      "sessions_send", // no multi-session routing
      "sessions_spawn", // no sub-agent spawning
      "message", // no channel delivery
    ],
  },

  // ── Cron ──
  cron: {
    enabled: false, // invariant 14: OPENCLAW_CRON_DISABLED
  },

  // ── Gateway ──
  gateway: {
    mode: "local", // no gateway service
  },
}
```

### Allowed Tools (what OpenClaw CAN do inside the sandbox)

| Tool               | Works? | Notes                                                                     |
| ------------------ | ------ | ------------------------------------------------------------------------- |
| `exec` (bash)      | Yes    | Runs commands inside the container. This is intentional.                  |
| `read`             | Yes    | Reads files in `/workspace`                                               |
| `write`            | Yes    | Writes files in `/workspace`                                              |
| `edit`             | Yes    | Edits files in `/workspace`                                               |
| `apply_patch`      | Yes    | Applies patches in `/workspace`                                           |
| `image`            | Maybe  | Uses LLM for generation — would work if model supports it, but not tested |
| `web_fetch`        | No     | Denied — `network=none`                                                   |
| `web_search`       | No     | Denied — `network=none`                                                   |
| `browser`          | No     | Denied — no Chromium, no display, no network                              |
| `cron`             | No     | Denied — Temporal is scheduler                                            |
| `memory`           | Yes    | Vector memory within workspace (local files only)                         |
| `sessions_list`    | Yes    | Read-only session introspection                                           |
| `sessions_history` | Yes    | Read-only session history                                                 |

### Model Catalog Sync

The `cogni` provider's `models` array must list every LiteLLM model alias the agent might use. The `SandboxGraphProvider` generates this from our LiteLLM config.

**Mapping from LiteLLM config** (`platform/infra/services/runtime/configs/litellm.config.yaml`):

```json5
// Each LiteLLM model_name becomes an OpenClaw model entry:
{
  id: "gemini-2.5-flash", // matches litellm model_name
  name: "Gemini 2.5 Flash", // display name
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 200000, // approximate, from provider docs
  maxTokens: 8192,
}
```

We set all costs to `0` because we do NOT want OpenClaw tracking costs — LiteLLM is the billing truth (invariant 11).

> **Open Question**: Should the model catalog be generated once at build time (baked into the image) or dynamically at each run? Dynamic is more flexible but adds startup latency. Build-time means rebuilding the image when models change. Recommendation: generate at run time in `SandboxGraphProvider`, since LiteLLM config may change without image rebuilds.

---

## Agent I/O Protocol

### Input

The `SandboxGraphProvider` prepares the workspace before invoking `runOnce()`:

```
/workspace/
├── .openclaw/
│   └── openclaw.json               # generated config (see above)
├── .cogni/
│   └── prompt.txt                   # user's message text (extracted from GraphRunRequest)
└── repo/                            # optional: host-cloned target repository
    └── ...
```

**`prompt.txt`**: The last user message from `GraphRunRequest.messages`, extracted as plain text. OpenClaw does not accept structured multi-message input via `--message` — it takes a single text string.

### Invocation

The `SandboxGraphProvider` calls `runOnce()` with:

```typescript
// Environment via llmProxy.env (injected by SandboxRunnerAdapter as container Env)
const env = {
  HOME: "/workspace",
  OPENCLAW_CONFIG_PATH: "/workspace/.openclaw/openclaw.json",
  OPENCLAW_STATE_DIR: "/workspace/.openclaw-state",
  OPENCLAW_LOAD_SHELL_ENV: "0",
};

// Command via argv (adapter joins with space, entrypoint runs via bash -lc)
const argv = [
  "node /app/dist/index.js agent",
  "--local --agent main",
  `--session-id ${runId}`,
  '--message "$(cat /workspace/.cogni/prompt.txt)"',
  "--json --timeout 540",
];
// Note: adapter joins argv with " " into a single Cmd string, then
// entrypoint.sh runs it via `bash -lc "$@"` — shell expansion happens
// inside the container, so $(cat ...) resolves correctly.
```

**Effective command inside container:**

```bash
HOME=/workspace \
OPENCLAW_CONFIG_PATH=/workspace/.openclaw/openclaw.json \
OPENCLAW_STATE_DIR=/workspace/.openclaw-state \
OPENCLAW_LOAD_SHELL_ENV=0 \
node /app/dist/index.js agent \
  --local --agent main \
  --session-id "${RUN_ID}" \
  --message "$(cat /workspace/.cogni/prompt.txt)" \
  --json --timeout 540
```

**Flag breakdown**:

| Flag           | Value       | Why                                                                          |
| -------------- | ----------- | ---------------------------------------------------------------------------- |
| `--local`      | (boolean)   | Bypass gateway, run embedded agent directly                                  |
| `--agent main` | `"main"`    | Route to the default agent defined in config                                 |
| `--session-id` | `${RUN_ID}` | Unique per sandbox invocation, used for session state                        |
| `--message`    | prompt text | The user's message to the agent                                              |
| `--json`       | (boolean)   | Output structured JSON to stdout (no other output)                           |
| `--timeout`    | `540`       | Agent timeout in seconds. Must be < container `maxRuntimeSec` for clean exit |

### Output

With `--json`, OpenClaw writes a JSON envelope to **stdout**:

```json5
{
  payloads: [
    {
      text: "The agent's final text response",
      mediaUrl: null,
    },
  ],
  meta: {
    durationMs: 12450,
    agentMeta: {
      sessionId: "run-abc123",
      provider: "cogni", // our provider name
      model: "cogni/gemini-2.5-flash",
      usage: {
        // OpenClaw-reported (UX hint only)
        input: 3200,
        output: 890,
        total: 4090,
      },
    },
    error: null, // or { "kind": "context_overflow", "message": "..." }
  },
}
```

**`SandboxGraphProvider` parsing**:

1. Parse stdout as JSON
2. Extract `payloads[0].text` → emit as `text_delta` AiEvent
3. Check `meta.error` → if present, return `GraphFinal.error`
4. `meta.agentMeta.usage` is a **UX hint only** — authoritative billing from LiteLLM `/spend/logs`
5. If stdout is not valid JSON (agent crash), treat as `GraphFinal.error` with stderr as diagnostics

### Exit Codes

| Code    | Meaning                                         | Action                                |
| ------- | ----------------------------------------------- | ------------------------------------- |
| `0`     | Success (even if `meta.error` is set)           | Parse JSON, check `meta.error`        |
| `1`     | CLI error (missing flags, config parse failure) | Return `GraphFinal.error` with stderr |
| `137`   | OOM killed (SIGKILL)                            | Return `errorCode: "oom_killed"`      |
| timeout | Container killed by `SandboxRunnerAdapter`      | Return `errorCode: "timeout"`         |

---

## Agent Provisioning Guide

### How OpenClaw Agents Work

Each OpenClaw agent is defined by:

1. **Config entry** in `openclaw.json` under `agents.list[]`
2. **Workspace directory** containing behavior files
3. **Model assignment** (which LLM to use)

### Pre-Configured Agent Setup (No Interactive Onboard)

OpenClaw does NOT require `openclaw onboard` to run. It gracefully defaults to `{}` if the config file is empty. Our `SandboxGraphProvider` generates the full config, so no onboarding is needed.

**Minimum required for agent to run:**

1. `openclaw.json` exists with provider config (generated by us)
2. At least one of `--agent`, `--session-id`, or `--to` is passed (we use `--agent main`)
3. LLM endpoint is reachable (our proxy at `localhost:8080`)

### Workspace Behavior Files

OpenClaw reads these files from the workspace directory at session start. They form the agent's system prompt:

| File           | Purpose                          | Required?                        |
| -------------- | -------------------------------- | -------------------------------- |
| `AGENTS.md`    | Main operating instructions      | Recommended                      |
| `SOUL.md`      | Agent personality and philosophy | Recommended                      |
| `USER.md`      | Context about the user/DAO       | Optional                         |
| `TOOLS.md`     | Environment-specific tool notes  | Optional                         |
| `IDENTITY.md`  | Name, emoji, avatar              | Optional                         |
| `HEARTBEAT.md` | Proactive task checklist         | Not used (cron disabled)         |
| `BOOTSTRAP.md` | First-run onboarding             | Not used (`skipBootstrap: true`) |
| `MEMORY.md`    | Long-term curated memory         | Optional                         |

**For Cogni sandbox agents**, the `SandboxGraphProvider` should pre-create at minimum:

```markdown
# /workspace/AGENTS.md

You are a sandboxed coding agent. You have access to bash, file read/write/edit.
You do NOT have internet access. All LLM calls route through localhost:8080.
Do not attempt web searches, fetches, or browser actions — they will fail.
Focus on the task in the workspace.
```

```markdown
# /workspace/SOUL.md

You are a focused, technical coding agent. Be direct and concise.
Write clean code. Explain your reasoning. Ask clarifying questions
if the task is ambiguous.
```

### Creating Custom Agents (P1+)

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

### Skills

OpenClaw skills (in `skills/` directory) provide domain-specific behavior. Skills that require network access (web search, APIs) are non-functional in the sandbox. Skills that work with local files (coding patterns, documentation) work fine.

> **Open Question**: Should we bundle a curated set of sandbox-compatible skills into the `cogni-sandbox-openclaw` image, or strip all skills? Skills add to image size and system prompt length. Need to audit which skills are sandbox-compatible.

---

## Billing & Observability

### Billing Flow

Unchanged from [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) P0.5 design and [EXTERNAL_EXECUTOR_BILLING.md](EXTERNAL_EXECUTOR_BILLING.md):

1. Every LLM call from OpenClaw transits our nginx proxy
2. Proxy injects `x-litellm-end-user-id: ${billingAccountId}`
3. Proxy injects `x-litellm-spend-logs-metadata: { "run_id": "${runId}", ... }`
4. LiteLLM records spend per `end_user` with `metadata.run_id`
5. After sandbox exits, `reconcileRun()` queries `GET /spend/logs?end_user=${billingAccountId}` and filters by `metadata.run_id`
6. Emits `usage_report` AiEvent → `RunEventRelay` commits `charge_receipt`

**OpenClaw-specific consideration**: A single sandbox run may generate 5–50+ LLM calls (one per tool-use turn). All are tracked under the same `billingAccountId` + `run_id`. The reconciliation query returns all of them. Sum `completion_tokens` + `prompt_tokens` across all calls for total run cost.

### Observability

- **Proxy audit log**: Every LLM request logged with timestamp, model, status, latency
- **LiteLLM → Langfuse**: All calls traced via `x-litellm-spend-logs-metadata` (contains `existing_trace_id`, `session_id`)
- **OpenClaw stdout**: Agent's final response and metadata (parsed by `SandboxGraphProvider`)
- **OpenClaw stderr**: Diagnostic output if agent fails (captured by `SandboxRunnerAdapter`)

### Token Consumption Risk

OpenClaw's autonomous tool-use loop has no explicit turn limit. A pathological agent could loop indefinitely, consuming tokens until the container timeout (default 600s).

**Mitigations (layered)**:

1. Container `maxRuntimeSec` (hard kill at timeout)
2. OpenClaw `--timeout` flag (clean exit before container kill)
3. LiteLLM per-key spend limits (backstop for runaway billing)
4. Proxy `proxy_read_timeout 300s` (individual request timeout)

> **Open Question**: Should we add a `max_tokens_per_run` budget? This would require either: (a) rate limiting in the proxy (not supported in nginx, would need OpenResty), or (b) a token-counting wrapper. Deferred to P1+ per SANDBOX_SCALING.md.

---

## Conversation Continuity

### P0.75: Stateless (each run is fresh)

Each sandbox invocation creates a new OpenClaw session. No conversation history persists. The user's message is passed via `--message`, and the agent responds without prior context.

This is acceptable for P0.75 (single-turn task execution: "fix this bug", "write this function").

### P1+: Workspace-Injected Context

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

### P2+: Persistent Sessions

For DAO agents with persistent workspace (ONE_WORKSPACE_PER_DAO pattern), mount the workspace volume across runs so OpenClaw's session transcripts, memory files, and `MEMORY.md` persist.

---

## Implementation Checklist

### Prerequisites

- [x] P0.5 proxy plumbing works (socket bridge, nginx proxy, billing headers)
- [x] `openclaw:local` Docker image built and available locally (v2026.2.4, 4GB)

---

### P0: Get OpenClaw Running in Sandbox (ASAP)

**Goal**: Prove OpenClaw runs in `network=none` sandbox, calls LLM via socket proxy, and billing headers reach LiteLLM. No graph provider wiring, no agent catalog, no reconciliation — just the container lifecycle working end-to-end.

**Principles**: Use `openclaw:local` as-is (no slimming). Fix only what's broken. Follow repo invariants.

#### Container Image

Thin layer over `openclaw:local` — add socat + our entrypoint, nothing else:

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

- [x] Create `services/sandbox-openclaw/Dockerfile` (thin layer as above)
- [x] Copy `entrypoint.sh` from `services/sandbox-runtime/`
- [x] Build: `docker build -t cogni-sandbox-openclaw services/sandbox-openclaw` (4s build)
- [x] Validate: `docker run --rm cogni-sandbox-openclaw node /app/dist/index.js --version` → `2026.2.4`

**Verified (2026-02-07)**: Cold boot test with `network=none`, pre-written `openclaw.json`, no proxy:

- Config loaded correctly (`provider: "cogni"`, `model: "gemini-2.5-flash"`)
- No setup/onboarding phase (`skipBootstrap: true` works)
- State written to `OPENCLAW_STATE_DIR` (sessions, transcripts) — not to readonly rootfs
- Valid JSON envelope on stdout (`payloads`, `meta`, `agentMeta`)
- Timed out reaching LLM at localhost:8080 (expected — no proxy in this test)
- Missing workspace files (AGENTS.md, SOUL.md) handled gracefully (noted as missing, no crash)

#### Environment & Config (SECRETS_HOST_ONLY + ReadonlyRootfs)

OpenClaw has three path-resolution mechanisms that can leak secrets or break on readonly rootfs. All three must be controlled:

1. **Config file** (`OPENCLAW_CONFIG_PATH`): Points to the exact `.json` file. Set to `/workspace/.openclaw/openclaw.json` (on writable workspace mount).
2. **State directory** (`OPENCLAW_STATE_DIR`): Where sessions, transcripts, caches go. Set to `/workspace/.openclaw-state` (writable). Prevents fallback to `$HOME/.openclaw` which would fail on readonly rootfs.
3. **Dotenv loading** (`loadDotEnv()`): Loads `.env` from CWD + `$OPENCLAW_STATE_DIR/.env`. Prevent by ensuring no `.env` file exists in `/workspace/` or `/workspace/.openclaw-state/`.
4. **Shell env fallback** (`OPENCLAW_LOAD_SHELL_ENV`): Off by default. Explicitly set to `0` as defense-in-depth.
5. **HOME**: Set to `/workspace` so any `$HOME` writes go to writable mount, not readonly rootfs.

**Container env vars** (set by `SandboxRunnerAdapter`):

```bash
HOME=/workspace
OPENCLAW_CONFIG_PATH=/workspace/.openclaw/openclaw.json
OPENCLAW_STATE_DIR=/workspace/.openclaw-state
OPENCLAW_LOAD_SHELL_ENV=0
```

> **Source**: `src/config/paths.ts:49-74` (state dir), `src/config/paths.ts:95-104` (config path), `src/infra/dotenv.ts:6-20` (dotenv). Verified against OpenClaw v2026.2.4.

#### Minimal openclaw.json

Single model alias, everything dangerous disabled. Written to `/workspace/.openclaw/openclaw.json` by test/provider before `runOnce()`:

```json
{
  "models": {
    "mode": "replace",
    "providers": {
      "cogni": {
        "baseUrl": "http://localhost:8080/v1",
        "api": "openai-completions",
        "apiKey": "proxy-handles-auth",
        "models": [
          {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 200000,
            "maxTokens": 8192,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "cogni/gemini-2.5-flash" },
      "workspace": "/workspace",
      "sandbox": { "mode": "off" },
      "skipBootstrap": true,
      "timeoutSeconds": 540
    },
    "list": [{ "id": "main", "default": true, "workspace": "/workspace" }]
  },
  "tools": {
    "elevated": { "enabled": false },
    "deny": [
      "group:web",
      "browser",
      "cron",
      "gateway",
      "nodes",
      "sessions_send",
      "sessions_spawn",
      "message"
    ]
  },
  "cron": { "enabled": false },
  "gateway": { "mode": "local" }
}
```

#### Proxy Header Fix

**Bug found & fixed**: Nginx template originally used `x-litellm-metadata` but LiteLLM reads `x-litellm-spend-logs-metadata` for spend log correlation. The in-proc path sets `metadata` in the request body; the proxy must use the correct header name for parity.

- [x] Fix `nginx.conf.template`: rename `x-litellm-metadata` → `x-litellm-spend-logs-metadata`
- [x] Fix all doc references (SANDBOXED_AGENTS.md, EXTERNAL_EXECUTOR_BILLING.md, sandbox-proxy/AGENTS.md)
- [ ] Verify metadata JSON includes `run_id`, `attempt`, `graph_id` (already present in `LlmProxyManager.generateConfig`)

#### Invocation

```bash
node /app/dist/index.js agent \
  --local --agent main \
  --message "$(cat /workspace/.cogni/prompt.txt)" \
  --json --timeout 540
```

**Output** (stdout, `--json` mode — from `src/commands/agent/delivery.ts:138-148`):

```json
{
  "payloads": [{ "text": "response text", "mediaUrl": null }],
  "meta": {
    "durationMs": 12450,
    "agentMeta": {
      "sessionId": "...",
      "provider": "cogni",
      "model": "cogni/gemini-2.5-flash",
      "usage": { "input": 3200, "output": 890, "total": 4090 }
    },
    "error": null
  }
}
```

#### Smoke Tests (P0 Merge Gates)

- [x] **OpenClaw boots**: `node /app/dist/index.js --version` → `2026.2.4`
- [ ] **Network isolated**: `curl` from container fails
- [x] **LLM call works**: OpenClaw agent calls LiteLLM (nemotron-nano-30b), gets response "hello from sandbox" (22s, 2128 tokens)
- [x] **JSON output parses**: stdout is valid JSON with `payloads` and `meta` — see `tests/_fixtures/sandbox/openclaw-expected-output.json`
- [ ] **No secrets in container**: env has no `LITELLM_MASTER_KEY`
- [ ] **Spend logs have run_id**: LiteLLM spend logs contain entry with `metadata.run_id` matching our `runId`

#### What NOT to Do (P0)

- No dynamic model-catalog sync from LiteLLM config
- No multi-stage "minimal file set" pruning of the 4GB image
- No perfect billing reconciliation — just prove spend logs contain `run_id` + `call_id`
- No `SandboxGraphProvider` / agent catalog / bootstrap wiring (that's P0.75)

#### File Pointers (P0)

| File                                                        | Status  |
| ----------------------------------------------------------- | ------- |
| `services/sandbox-openclaw/Dockerfile`                      | Done    |
| `services/sandbox-openclaw/entrypoint.sh`                   | Done    |
| `platform/infra/services/sandbox-proxy/nginx.conf.template` | Fixed   |
| `tests/_fixtures/sandbox/openclaw-config.json`              | Done    |
| `tests/_fixtures/sandbox/openclaw-expected-output.json`     | Done    |
| `scripts/diag-openclaw-sandbox.mjs`                         | WIP     |
| `tests/stack/sandbox/sandbox-openclaw.stack.test.ts`        | Pending |

---

### P0.75: OpenClaw via Graph Execution (E2E)

**Trigger**: P0 proves OpenClaw runs in sandbox. Now wire it into the graph execution pipeline so users can select it in the chat UI.

#### SandboxGraphProvider

- [ ] Create `src/adapters/server/sandbox/sandbox-graph.provider.ts`:
  - `providerId: "sandbox"`
  - `canHandle(graphId)`: matches `sandbox:*`
  - `runGraph(req)`: write openclaw.json + prompt → call `runOnce()` → parse JSON → emit AiEvents
- [ ] Write workspace files (.openclaw/openclaw.json, .cogni/prompt.txt)
- [ ] Parse OpenClaw JSON output → `text_delta` AiEvents → `GraphFinal`
- [ ] Handle agent errors (meta.error, non-zero exit, invalid JSON)

#### Agent Catalog

- [ ] Create `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts`:
  - `listAgents()`: returns `sandbox:agent` entry
  - Gated by `SANDBOX_ENABLED` env flag

#### Bootstrap Wiring

- [ ] Wire `SandboxGraphProvider` in `graph-executor.factory.ts`
- [ ] Wire `SandboxAgentCatalogProvider` in `agent-discovery.ts`
- [ ] Add `SANDBOX_ENABLED` feature flag, gate both registrations
- [ ] Wire `SandboxRunnerAdapter` + config into provider constructor

#### Billing Reconciliation

- [ ] Query LiteLLM `/spend/logs?end_user=${billingAccountId}`, filter by `metadata.run_id`
- [ ] Sum token usage across all LLM calls in the run
- [ ] Emit `usage_report` AiEvent → `charge_receipt`

#### Tests (P0.75 Merge Gates)

- [ ] **E2E chat flow**: `POST /api/v1/ai/chat` with `graphName: "sandbox:agent"` → SSE response
- [ ] **Agent catalog**: `GET /api/v1/ai/agents` includes `sandbox:agent` when `SANDBOX_ENABLED=true`
- [ ] **Billing verified**: `charge_receipts` has entry matching `runId`
- [ ] **Graceful failure**: Agent error → structured `GraphFinal.error`

#### File Pointers (P0.75)

| File                                                            | Status  |
| --------------------------------------------------------------- | ------- |
| `src/adapters/server/sandbox/sandbox-graph.provider.ts`         | Pending |
| `src/adapters/server/sandbox/sandbox-agent-catalog.provider.ts` | Pending |
| `src/bootstrap/graph-executor.factory.ts`                       | Update  |
| `src/bootstrap/agent-discovery.ts`                              | Update  |
| `tests/stack/sandbox/sandbox-openclaw-e2e.stack.test.ts`        | Pending |

---

## Open Questions

### OQ-1: Multi-Stage Docker Build Completeness

What is the minimal file set to copy from `openclaw:local` for embedded agent mode? Specifically:

- Is `ui/dist/` needed? (Likely no for `--local` mode, but untested)
- Is `skills/` needed at startup or lazy-loaded?
- Are `docs/reference/templates/` needed when `skipBootstrap: true`?
- What `node_modules` can be pruned?

**Resolution**: Build the image and test `openclaw agent --local --agent main --message "hello" --json`. If it works, we have the right set. If not, add missing files iteratively.

### OQ-2: `/v1/models` Discovery

Does OpenClaw call `GET /v1/models` at startup or during model resolution? Our nginx proxy forwards **all methods** on `/v1/` (not just POST), so `GET /v1/models` would pass through to LiteLLM, which supports this endpoint. The question is whether OpenClaw actually makes this call when models are pre-configured in `openclaw.json`, or whether it's only used for auto-discovery of available models.

**Resolution**: Likely a non-issue since the proxy forwards it and LiteLLM handles it. Verify by checking proxy access logs during an OpenClaw test run.

### OQ-3: OpenAI Completions vs Responses API

OpenClaw supports both `openai-completions` and `openai-responses`. We default to `openai-completions` because LiteLLM's OpenAI-compatible proxy speaks this format. But `openai-responses` may have benefits (reasoning separation). Does LiteLLM support the Responses API format?

**Resolution**: Use `openai-completions` for P0.75. Evaluate Responses API for P1+ if LiteLLM adds support.

### OQ-4: Streaming Passthrough

OpenClaw internally streams LLM responses (SSE). In `--json` mode, it buffers the entire response and outputs the final envelope. For P0.75 (non-streaming to client), this is fine. For future streaming support, can we tap into OpenClaw's stream events before the final envelope?

**Resolution**: Deferred to P1+. Would likely require running OpenClaw without `--json` and parsing stdout incrementally.

### OQ-5: Workspace File Ownership

The `SandboxRunnerAdapter` hardcodes `User: "sandboxer"` (uid 1001). The host-mounted workspace is created by the Node.js host process (likely running as a different uid). Will file permissions conflict?

**Resolution**: The adapter already handles this for the existing P0.5 sandbox — the same pattern applies. Create workspace with `0o777` or `chown 1001:1001` on the host before mounting. OpenClaw writes config/session files to `OPENCLAW_CONFIG_PATH` and `OPENCLAW_STATE_DIR`, both on the workspace mount.

### OQ-6: OpenClaw Version Pinning

How do we track which OpenClaw version is baked into `cogni-sandbox-openclaw`? The `openclaw:local` tag is mutable. We should either:

- Pin to a specific OpenClaw git SHA in the Dockerfile
- Tag our image with the OpenClaw version
- Use a content-addressed image reference

**Resolution**: Use `LABEL openclaw.version=${GIT_SHA}` in the Dockerfile. Pin `openclaw:local` builds to specific commits.

### OQ-7: `--message` Size Limits

OpenClaw receives the prompt via CLI `--message` flag. For very long prompts (e.g., pasting an entire file for review), this could hit shell argument limits (typically 128KB–2MB depending on OS). Alternative: write message to a file and use shell substitution `--message "$(cat file)"`.

**Resolution**: Our invocation already uses `$(cat /workspace/.cogni/prompt.txt)`. Verify this works for prompts up to the shell limit. For larger inputs, consider writing a wrapper script inside the container.

---

## Anti-Patterns

| Pattern                                  | Problem                                                          |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Enable OpenClaw sandbox (`mode: "all"`)  | Docker not available in container; hard crash                    |
| Enable OpenClaw cron                     | Duplicate scheduler; billing surprises                           |
| Enable elevated tools                    | Collapses sandbox security boundary                              |
| Use `models.mode: "merge"`               | Built-in providers cause auth resolution noise, confusing errors |
| Start OpenClaw gateway in sandbox        | Requires network listeners; violates one-shot semantics          |
| Pass API keys via env to sandbox         | Violates SECRETS_HOST_ONLY; proxy handles auth                   |
| Trust OpenClaw's usage reporting         | UX hint only; LiteLLM is billing truth                           |
| Run `openclaw onboard` in container      | Interactive; not needed with pre-created config                  |
| Mount Docker socket into sandbox         | Allows container escape; violates NETWORK_DEFAULT_DENY           |
| Leave `web_fetch`/`browser` enabled      | Immediate failure (`network=none`); confuses agent               |
| Proxy OpenClaw dashboard                 | Network + ports required; not until P2+                          |
| Persist sessions without workspace mount | Session state lost on container exit                             |

---

## Related Documents

- [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) — Sandbox phases (P0/P0.5/P0.75), core invariants 1–12
- [EXTERNAL_EXECUTOR_BILLING.md](EXTERNAL_EXECUTOR_BILLING.md) — Reconciliation pattern, billing invariants
- [SANDBOX_SCALING.md](SANDBOX_SCALING.md) — Proxy selection, shared proxy, signed tokens, threat model
- [GRAPH_EXECUTION.md](GRAPH_EXECUTION.md) — GraphExecutorPort, AggregatingGraphExecutor
- [TOOL_USE_SPEC.md](TOOL_USE_SPEC.md) — Tool execution, DENY_BY_DEFAULT
- [RBAC_SPEC.md](RBAC_SPEC.md) — ExecutionGrant, allowSandbox gate
- [OPENCLAW_SANDBOX_CONTROLS.md](OPENCLAW_SANDBOX_CONTROLS.md) — Dynamic catalog, git relay, dashboard (next phase)
- OpenClaw repo: `/Users/derek/dev/openclaw/` — source of truth for OpenClaw internals

---

**Last Updated**: 2026-02-07
**Status**: P0 (get OpenClaw running) validated; P0.75 wiring → [OPENCLAW_SANDBOX_CONTROLS.md](OPENCLAW_SANDBOX_CONTROLS.md)
