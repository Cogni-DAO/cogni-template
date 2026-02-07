#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Minimal sandbox agent: reads messages, calls LLM via proxy, prints response.
 *
 * I/O protocol (per SANDBOXED_AGENTS.md P0.75):
 *   Input:  /workspace/.cogni/messages.json  (OpenAI messages array)
 *   Output: stdout — SandboxProgramContract JSON envelope
 *   Model:  COGNI_MODEL env var
 *   LLM:    OPENAI_API_BASE env var (socat bridge → proxy → LiteLLM)
 *
 * Output envelope matches OpenClaw --json format so SandboxGraphProvider
 * uses identical parse logic for both this script and OpenClaw.
 */

import { readFile } from "node:fs/promises";

const MESSAGES_PATH = "/workspace/.cogni/messages.json";
// biome-ignore lint/style/noProcessEnv: standalone container script, no config framework
const BASE_URL = process.env.OPENAI_API_BASE ?? "http://localhost:8080";
// biome-ignore lint/style/noProcessEnv: standalone container script, no config framework
const MODEL = process.env.COGNI_MODEL;

const t0 = Date.now();

/** Write SandboxProgramContract envelope to stdout and exit. */
function emit(payloads, error = null) {
  const envelope = {
    payloads,
    meta: { durationMs: Date.now() - t0, error },
  };
  process.stdout.write(JSON.stringify(envelope));
  process.exit(error ? 1 : 0);
}

if (!MODEL) {
  emit([], { code: "config_error", message: "COGNI_MODEL not set" });
}

// Read messages written by SandboxGraphProvider
let messages;
try {
  const raw = await readFile(MESSAGES_PATH, "utf-8");
  messages = JSON.parse(raw);
} catch (err) {
  emit([], {
    code: "input_error",
    message: `Failed to read ${MESSAGES_PATH}: ${err.message}`,
  });
}

// Call LLM via proxy (socat → nginx → LiteLLM)
const url = `${BASE_URL}/v1/chat/completions`;
let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages }),
  });
} catch (err) {
  emit([], {
    code: "llm_error",
    message: `Request failed: ${err.message}`,
  });
}

if (!res.ok) {
  const body = await res.text().catch(() => "");
  emit([], {
    code: "llm_error",
    message: `HTTP ${res.status}: ${body.slice(0, 500)}`,
  });
}

const data = await res.json();
const content = data.choices?.[0]?.message?.content ?? "";

emit([{ text: content }]);
