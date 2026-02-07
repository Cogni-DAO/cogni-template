#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/diag-openclaw-sandbox`
 * Purpose: Diagnostic script for OpenClaw-in-sandbox with LLM proxy. Tests full flow: workspace setup → proxy start → container run → parse output.
 * Scope: Standalone diagnostic; not imported by src/. Requires cogni-sandbox-openclaw:latest image, dev stack, LITELLM_MASTER_KEY.
 * Invariants: Uses LlmProxyManager directly (same path as SandboxRunnerAdapter); container runs with network=none + socket bridge.
 * Side-effects: IO (Docker containers, tmp workspace, proxy lifecycle)
 * Links: docs/OPENCLAW_SANDBOX_SPEC.md, src/adapters/server/sandbox/llm-proxy-manager.ts
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import Docker from "dockerode";

const OPENCLAW_IMAGE = "cogni-sandbox-openclaw:latest";
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

if (!LITELLM_MASTER_KEY) {
  console.error(
    "FATAL: LITELLM_MASTER_KEY not set. Start dev stack: pnpm dev:infra"
  );
  process.exit(1);
}

const docker = new Docker();
const runId = `diag-oc-${Date.now()}`;
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "diag-openclaw-"));

function ts() {
  return `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;
}
const t0 = Date.now();

console.log(`${ts()} workspace: ${workspace}`);
console.log(`${ts()} runId: ${runId}`);

// ── Step 1: Write OpenClaw config ────────────────────────────────────────────
const openclawDir = path.join(workspace, ".openclaw");
const stateDir = path.join(workspace, ".openclaw-state");
const cogniDir = path.join(workspace, ".cogni");

fs.mkdirSync(openclawDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(cogniDir, { recursive: true });

const config = {
  models: {
    mode: "replace",
    providers: {
      cogni: {
        baseUrl: "http://localhost:8080/v1",
        api: "openai-completions",
        apiKey: "proxy-handles-auth",
        models: [
          {
            id: "gemini-2.5-flash",
            name: "Gemini 2.5 Flash",
            reasoning: false,
            input: ["text"],
            contextWindow: 200000,
            maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: "cogni/gemini-2.5-flash" },
      workspace: "/workspace",
      sandbox: { mode: "off" },
      skipBootstrap: true,
      timeoutSeconds: 60,
    },
    list: [{ id: "main", default: true, workspace: "/workspace" }],
  },
  tools: {
    elevated: { enabled: false },
    deny: [
      "group:web",
      "browser",
      "cron",
      "gateway",
      "nodes",
      "sessions_send",
      "sessions_spawn",
      "message",
    ],
  },
  cron: { enabled: false },
  gateway: { mode: "local" },
};

fs.writeFileSync(
  path.join(openclawDir, "openclaw.json"),
  JSON.stringify(config, null, 2)
);
fs.writeFileSync(
  path.join(cogniDir, "prompt.txt"),
  'Say "hello from sandbox" and nothing else.'
);

console.log(`${ts()} workspace prepared`);

// ── Step 2: Start LLM proxy ─────────────────────────────────────────────────
// Use LlmProxyManager directly (same as SandboxRunnerAdapter does)
const { LlmProxyManager } = await import(
  "../src/adapters/server/sandbox/llm-proxy-manager.ts"
);

const proxyManager = new LlmProxyManager(docker);
let proxyHandle;

try {
  console.log(`${ts()} starting proxy...`);
  proxyHandle = await proxyManager.start({
    runId,
    attempt: 0,
    litellmMasterKey: LITELLM_MASTER_KEY,
    billingAccountId: "diag-openclaw-test",
    // litellmHost defaults to "litellm:4000" (Docker DNS on sandbox-internal)
  });
  console.log(`${ts()} proxy started: volume=${proxyHandle.socketVolume}`);
} catch (err) {
  console.error(`${ts()} proxy failed:`, err.message);
  process.exit(1);
}

// ── Step 3: Run OpenClaw container ───────────────────────────────────────────
try {
  console.log(`${ts()} creating openclaw container...`);

  const cmd = [
    "node /app/dist/index.js agent --local --agent main",
    '--message "$(cat /workspace/.cogni/prompt.txt)"',
    "--json --timeout 55",
  ].join(" ");

  const container = await docker.createContainer({
    Image: OPENCLAW_IMAGE,
    Cmd: [cmd],
    Env: [
      "HOME=/workspace",
      "OPENCLAW_CONFIG_PATH=/workspace/.openclaw/openclaw.json",
      "OPENCLAW_STATE_DIR=/workspace/.openclaw-state",
      "OPENCLAW_LOAD_SHELL_ENV=0",
      "OPENAI_API_BASE=http://localhost:8080",
      `RUN_ID=${runId}`,
      "LLM_PROXY_SOCKET=/llm-sock/llm.sock",
    ],
    User: "1001:1001", // sandboxer uid (matches SandboxRunnerAdapter)
    HostConfig: {
      NetworkMode: "none",
      Binds: [`${workspace}:/workspace:rw`],
      Mounts: [
        {
          Type: "volume",
          Source: proxyHandle.socketVolume,
          Target: "/llm-sock",
          ReadOnly: false,
        },
      ],
      Memory: 512 * 1024 * 1024, // 512MB
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "size=64m", "/run": "size=8m" },
      SecurityOpt: ["no-new-privileges"],
      CapDrop: ["ALL"],
    },
  });

  console.log(`${ts()} starting container...`);
  await container.start();

  console.log(`${ts()} waiting for container to finish (up to 65s)...`);
  const waitResult = await container.wait();
  console.log(`${ts()} container exited: code=${waitResult.StatusCode}`);

  // Collect logs
  const logBuf = await container.logs({ stdout: true, stderr: true });
  const logs = Buffer.isBuffer(logBuf)
    ? logBuf.toString("utf8")
    : String(logBuf);

  // Split stdout/stderr (Docker multiplexes with 8-byte header per frame)
  // For simplicity, just print everything
  console.log(`\n${"=".repeat(60)}`);
  console.log("CONTAINER OUTPUT:");
  console.log("=".repeat(60));
  console.log(logs);
  console.log("=".repeat(60));

  // Try to parse JSON from output
  const jsonMatch = logs.match(/\{[\s\S]*"payloads"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const envelope = JSON.parse(jsonMatch[0]);
      console.log(`\n${ts()} PARSED ENVELOPE:`);
      console.log(
        `  payloads: ${JSON.stringify(envelope.payloads?.map((p) => p.text?.slice(0, 100)))}`
      );
      console.log(`  error: ${JSON.stringify(envelope.meta?.error)}`);
      console.log(`  duration: ${envelope.meta?.durationMs}ms`);
      console.log(`  model: ${envelope.meta?.agentMeta?.model}`);
      console.log(`  aborted: ${envelope.meta?.aborted}`);
    } catch (e) {
      console.log(`${ts()} JSON parse failed:`, e.message);
    }
  } else {
    console.log(`${ts()} No JSON envelope found in output`);
  }

  // Cleanup container
  await container.remove().catch(() => {});
} catch (err) {
  console.error(`${ts()} container error:`, err.message);
}

// ── Step 4: Stop proxy, check audit log ──────────────────────────────────────
console.log(`\n${ts()} stopping proxy...`);
const logPath = await proxyManager.stop(runId);
if (logPath && fs.existsSync(logPath)) {
  const auditLog = fs.readFileSync(logPath, "utf8");
  console.log(`\n${"=".repeat(60)}`);
  console.log("PROXY AUDIT LOG:");
  console.log("=".repeat(60));
  console.log(auditLog || "(empty)");
  console.log("=".repeat(60));
} else {
  console.log(`${ts()} no audit log found`);
}
proxyManager.cleanup(runId);

// ── Step 5: Check workspace state ────────────────────────────────────────────
console.log(`\n${ts()} workspace files after run:`);
const walkSync = (dir, prefix = "") => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) walkSync(path.join(dir, entry.name), rel);
    else console.log(`  ${rel}`);
  }
};
walkSync(workspace);

// Cleanup workspace
fs.rmSync(workspace, { recursive: true, force: true });
console.log(`\n${ts()} done.`);
