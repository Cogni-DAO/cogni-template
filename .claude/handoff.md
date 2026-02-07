# Handoff: OpenClaw Sandbox P0 — Container Proven, Proxy Integration Next

## Branch

`feat/sandbox-0.75` — working off `feat/sandbox-0.5` (PR #328 against `staging`).

## What Was Done This Session

### 1. Deep OpenClaw source audit (verified against v2026.2.4)

Found and fixed three spec errors by reading OpenClaw source:

- **Config env var**: `OPENCLAW_CONFIG_DIR` → `OPENCLAW_CONFIG_PATH` (full file path, not directory). Source: `src/config/paths.ts:95-104`
- **State dir**: Must set `OPENCLAW_STATE_DIR=/workspace/.openclaw-state` to prevent writes to readonly rootfs. Source: `src/config/paths.ts:49-74`
- **Dotenv risk**: `loadDotEnv()` loads `.env` from CWD + `$STATE_DIR/.env`. Must ensure no `.env` present. Source: `src/infra/dotenv.ts:6-20`
- **HOME**: Set to `/workspace` (writable) not `/home/sandboxer` (readonly rootfs)

### 2. LiteLLM metadata header bug fix

**nginx.conf.template line 51**: `x-litellm-metadata` → `x-litellm-spend-logs-metadata`. The old header name was silently ignored by LiteLLM — spend logs had no `run_id` correlation, breaking per-run billing reconciliation. Fixed in template + all 6 doc references.

### 3. Built `cogni-sandbox-openclaw:latest` image

Thin layer: `FROM openclaw:local` + socat + our entrypoint.sh. 4-second build. Files:

- `services/sandbox-openclaw/Dockerfile`
- `services/sandbox-openclaw/entrypoint.sh` (copied from `services/sandbox-runtime/`)

### 4. Proved OpenClaw boots clean in sandbox (no LLM)

```bash
docker run --rm --network=none \
  -e HOME=/workspace \
  -e OPENCLAW_CONFIG_PATH=/workspace/.openclaw/openclaw.json \
  -e OPENCLAW_STATE_DIR=/workspace/.openclaw-state \
  -e OPENCLAW_LOAD_SHELL_ENV=0 \
  -v /tmp/workspace:/workspace:rw \
  openclaw:local node /app/dist/index.js agent --local --agent main \
    --message "Say hello" --json --timeout 10
```

Results:

- No setup/onboarding phase (`skipBootstrap: true` works)
- Config loaded correctly (provider: "cogni", model as configured)
- State written to `OPENCLAW_STATE_DIR` (not readonly rootfs)
- Valid JSON envelope on stdout matching `SandboxProgramContract`
- Missing workspace files (AGENTS.md, SOUL.md) handled gracefully
- Timed out reaching LLM (expected — no proxy)

### 5. Proved OpenClaw completes LLM call via LiteLLM

Used `--network=host` to bypass proxy and hit LiteLLM directly at `localhost:4000` with nemotron-nano-30b (free model). This is NOT the production path — just proves the agent loop works.

```json
{
  "payloads": [{ "text": "hello from sandbox", "mediaUrl": null }],
  "meta": {
    "durationMs": 21944,
    "agentMeta": {
      "provider": "cogni",
      "model": "nemotron-nano-30b",
      "usage": { "input": 1940, "output": 188, "total": 2128 }
    },
    "aborted": false
  }
}
```

### 6. Added P0 section to OPENCLAW_SANDBOX_SPEC.md

New section "P0: Get OpenClaw Running in Sandbox (ASAP)" with Dockerfile, env vars, config, invocation, and smoke test checklist. Separates P0 (container works) from P0.75 (graph provider wiring).

## What's NOT Done — Next Steps

### Immediate: Run OpenClaw through the socket proxy (`network=none`)

The LLM call was proven with `--network=host` (direct LiteLLM access). The next step is proving it works through the **actual proxy infrastructure** (`network=none` + socat + nginx proxy + socket bridge). This is the production path.

Use `SandboxRunnerAdapter` with `imageName: "cogni-sandbox-openclaw:latest"` and pass OpenClaw env vars via `llmProxy.env`:

```typescript
runner.runOnce({
  runId,
  workspacePath: workspace, // contains .openclaw/openclaw.json + .cogni/prompt.txt
  argv: [
    "node /app/dist/index.js agent --local --agent main " +
      '--message "$(cat /workspace/.cogni/prompt.txt)" --json --timeout 55',
  ],
  limits: { maxRuntimeSec: 60, maxMemoryMb: 512 },
  llmProxy: {
    enabled: true,
    billingAccountId: "test-billing",
    attempt: 0,
    env: {
      HOME: "/workspace",
      OPENCLAW_CONFIG_PATH: "/workspace/.openclaw/openclaw.json",
      OPENCLAW_STATE_DIR: "/workspace/.openclaw-state",
      OPENCLAW_LOAD_SHELL_ENV: "0",
    },
  },
});
```

The fixture config at `tests/_fixtures/sandbox/openclaw-config.json` already has `baseUrl: "http://localhost:8080/v1"` (the socat bridge endpoint).

A diagnostic script exists at `scripts/diag-openclaw-sandbox.mjs` but needs `tsx` to run (imports TS). It failed on the proxy readiness check — likely because the initial attempt used `litellmHost: "host.docker.internal:4000"` instead of the default `litellm:4000` (Docker DNS). This was partially fixed but not re-tested. The default should work.

### After proxy works: Write the stack test

`tests/stack/sandbox/sandbox-openclaw.stack.test.ts` — modeled after `sandbox-llm-completion.stack.test.ts`. Use fixtures from `tests/_fixtures/sandbox/`. Gates:

- OpenClaw boots in sandbox
- LLM call completes via proxy
- JSON output matches contract
- No secrets in container env
- Proxy audit log has entries

### After tests: P0.75 wiring (separate PR scope)

- `SandboxGraphProvider` (parses OpenClaw JSON → AiEvents)
- `SandboxAgentCatalogProvider` (lists `sandbox:agent`)
- Bootstrap wiring in `graph-executor.factory.ts` + `agent-discovery.ts`
- Billing reconciliation via LiteLLM `/spend/logs`

### Parallel track: Canary agent script (run.mjs)

A separate developer is implementing `services/sandbox-runtime/agent/run.mjs` — a 25-line script that conforms to the same `SandboxProgramContract` envelope format. Feedback given: output `{ payloads: [{text}], meta: {error?, durationMs?} }` not plain text. The `SandboxGraphProvider` will parse both run.mjs and OpenClaw output identically.

## Key Files

| File                                                        | What                                         |
| ----------------------------------------------------------- | -------------------------------------------- |
| `docs/OPENCLAW_SANDBOX_SPEC.md`                             | Master spec — P0 section has verified steps  |
| `docs/SANDBOXED_AGENTS.md`                                  | Parent spec — invariants 1-12, phase defs    |
| `services/sandbox-openclaw/Dockerfile`                      | 6-line thin image (openclaw:local + socat)   |
| `services/sandbox-openclaw/entrypoint.sh`                   | socat bridge + bash -lc exec                 |
| `platform/infra/services/sandbox-proxy/nginx.conf.template` | Proxy config (header bug fixed)              |
| `src/adapters/server/sandbox/sandbox-runner.adapter.ts`     | Container lifecycle (P0.5, done)             |
| `src/adapters/server/sandbox/llm-proxy-manager.ts`          | Proxy lifecycle (P0.5, done)                 |
| `src/ports/sandbox-runner.port.ts`                          | Port interfaces                              |
| `tests/_fixtures/sandbox/openclaw-config.json`              | Working config fixture (proxy endpoint)      |
| `tests/_fixtures/sandbox/openclaw-expected-output.json`     | Example successful output                    |
| `tests/_fixtures/sandbox/fixtures.ts`                       | Test helpers (runWithProxy, createWorkspace) |
| `scripts/diag-openclaw-sandbox.mjs`                         | Diagnostic script (WIP, needs tsx)           |

## Commits This Session

```
f30d9758 fix(sandbox): correct LiteLLM metadata header and add P0 OpenClaw spec
```

Uncommitted: Dockerfile, entrypoint, fixtures, diag script, spec progress updates.

## Gotchas for Next Agent

- `OPENCLAW_CONFIG_PATH` is a **file path** (not dir). Use `/workspace/.openclaw/openclaw.json`.
- `loadDotEnv()` loads from CWD + `$STATE_DIR/.env` — ensure no `.env` in workspace.
- Proxy header is `x-litellm-spend-logs-metadata` (NOT `x-litellm-metadata`).
- OpenClaw uses uid 1000 (`node` user) in its image, but `SandboxRunnerAdapter` overrides to uid 1001 (`sandboxer`). Works fine — home dir irrelevant since `HOME=/workspace`.
- Docker tmpfs at `/run` masks volume mounts. Socket volume is at `/llm-sock/` (top-level).
- `openclaw:local` is 4GB. Image is already built locally. Don't try to slim it in P0.
- Use `nemotron-nano-30b` for testing (free model via OpenRouter).
- The `systemPromptReport` in OpenClaw output is verbose (~100 lines). Provider should only parse `payloads` and `meta` (top-level).
- OpenClaw env var `OPENCLAW_LOAD_SHELL_ENV` defaults to OFF — set to `0` explicitly as defense-in-depth.
