// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/harness/factory`
 * Purpose: Verifies contract test harness creation and infrastructure setup under isolated test conditions.
 * Scope: Covers test environment creation, resource management, and cleanup. Does NOT mock external services or ports.
 * Invariants: Each harness gets fresh infrastructure; resources cleaned up on teardown; real service dependencies maintained.
 * Side-effects: IO
 * Notes: Creates temporary directories, HTTP servers, and process spawning for contract test isolation.
 * Links: tests/contract/ports/
 * @public
 */

import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface HarnessPorts {
  aiBaseUrl?: string;
  dbUrl?: string;
}

export interface TestHarness {
  tmpdir: string;
  ports: HarnessPorts;
  cleanup: (() => void | Promise<void>)[];
}

export interface MakeHarnessOptions {
  llmStub?: boolean;
}

/**
 * Create test harness with temp dir and optional stubs.
 */
export async function makeHarness(
  opts?: MakeHarnessOptions
): Promise<TestHarness> {
  const dir = mkdtempSync(join(tmpdir(), "cogni-tests-"));
  const h: TestHarness = { tmpdir: dir, ports: {}, cleanup: [] };

  if (opts?.llmStub) {
    const { baseUrl, close } = await startLlmStubServer();
    h.ports.aiBaseUrl = baseUrl;
    h.cleanup.push(close);
  }

  // Always remove temp dir last
  h.cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  return h;
}

export async function dispose(h: TestHarness): Promise<void> {
  // Run LIFO to reduce cross-resource coupling
  for (let i = h.cleanup.length - 1; i >= 0; i--) {
    const cleanupFn = h.cleanup[i];
    if (cleanupFn) {
      await cleanupFn();
    }
  }
}

/**
 * Minimal HTTP stub for LLM completions.
 */
async function startLlmStubServer(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    if (req.method === "POST" && req.url?.startsWith("/v1/chat/completions")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const resp = {
          id: "stub-completion",
          choices: [
            { message: { role: "assistant", content: "stub-response" } },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        };
        res.setHeader("content-type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify(resp));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Failed to bind stub server");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      ),
  };
}
