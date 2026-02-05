// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/sandbox/sandbox-litellm`
 * Purpose: P0.5a acceptance tests proving sandbox containers can reach LiteLLM via internal network
 *          while remaining isolated from the public internet.
 * Scope: Tests LiteLLM reachability, network isolation (route, DNS, IP). Does not test LLM completions or secrets handling.
 * Invariants:
 *   - Containers on sandbox-internal can only reach services on the same network
 *   - No public internet access (internal: true prevents external gateway)
 *   - No Docker socket access (container escape prevention)
 * Side-effects: IO (Docker containers, filesystem)
 * Links: docs/SANDBOXED_AGENTS.md, P0.5a spec
 * @public
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import Docker from "dockerode";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { SandboxRunnerAdapter } from "@/adapters/server/sandbox";

const SANDBOX_IMAGE = "cogni-sandbox-runtime:latest";
const SANDBOX_INTERNAL_NETWORK = "sandbox-internal";

/**
 * Generate a unique run ID to avoid container name collisions.
 */
function uniqueRunId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

describe("Sandbox LiteLLM Reachability (P0.5a)", () => {
  const docker = new Docker();
  let runner: SandboxRunnerAdapter;
  let workspace: string;

  beforeAll(async () => {
    // Verify sandbox image exists
    try {
      await docker.getImage(SANDBOX_IMAGE).inspect();
    } catch {
      throw new Error(
        `Sandbox image ${SANDBOX_IMAGE} not found. Run: pnpm sandbox:docker:build`
      );
    }

    // Verify sandbox-internal network exists (requires dev stack)
    try {
      await docker.getNetwork(SANDBOX_INTERNAL_NETWORK).inspect();
    } catch {
      throw new Error(
        `Network ${SANDBOX_INTERNAL_NETWORK} not found. Start dev stack: pnpm dev:infra`
      );
    }

    runner = new SandboxRunnerAdapter({ imageName: SANDBOX_IMAGE });

    // Create workspace for tests
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "sandbox-litellm-"));
  });

  afterEach(async () => {
    // Clean workspace contents between tests
    const files = await fs.readdir(workspace);
    await Promise.all(
      files.map((f) => fs.rm(path.join(workspace, f), { recursive: true }))
    );
  });

  it("container can reach LiteLLM health endpoint (HTTP 200)", async () => {
    // Use curl with -w to get HTTP status code - robust against response body changes
    const result = await runner.runOnce({
      runId: uniqueRunId("test-litellm-health"),
      workspacePath: workspace,
      argv: [
        "bash",
        "-lc",
        "HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://litellm:4000/health/liveliness); echo \"HTTP_CODE=$HTTP_CODE\"",
      ],
      limits: { maxRuntimeSec: 15, maxMemoryMb: 128 },
      networkMode: {
        mode: "internal",
        networkName: SANDBOX_INTERNAL_NETWORK,
      },
    });

    // Check for HTTP 200 status code
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("HTTP_CODE=200");
  });

  it("container has no default route (internal network isolation)", async () => {
    // Check that there's no default route - this is the definitive test for isolation
    const result = await runner.runOnce({
      runId: uniqueRunId("test-no-default-route"),
      workspacePath: workspace,
      argv: [
        "bash",
        "-lc",
        "ip route show default 2>/dev/null | grep -q default && echo 'HAS_DEFAULT_ROUTE' || echo 'NO_DEFAULT_ROUTE'",
      ],
      limits: { maxRuntimeSec: 10, maxMemoryMb: 128 },
      networkMode: {
        mode: "internal",
        networkName: SANDBOX_INTERNAL_NETWORK,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("NO_DEFAULT_ROUTE");
  });

  it("container cannot resolve external DNS", async () => {
    // DNS resolution should fail for external domains
    const result = await runner.runOnce({
      runId: uniqueRunId("test-dns-blocked"),
      workspacePath: workspace,
      argv: [
        "bash",
        "-lc",
        "getent hosts example.com 2>&1 && echo 'DNS_RESOLVED' || echo 'DNS_BLOCKED'",
      ],
      limits: { maxRuntimeSec: 10, maxMemoryMb: 128 },
      networkMode: {
        mode: "internal",
        networkName: SANDBOX_INTERNAL_NETWORK,
      },
    });

    expect(result.stdout).toContain("DNS_BLOCKED");
    expect(result.stdout).not.toContain("DNS_RESOLVED");
  });

  it("container cannot reach external IP directly", async () => {
    // Try to reach Cloudflare DNS by IP - should fail (no route)
    const result = await runner.runOnce({
      runId: uniqueRunId("test-ip-blocked"),
      workspacePath: workspace,
      argv: [
        "bash",
        "-lc",
        "curl -s --max-time 3 http://1.1.1.1 2>&1 && echo 'IP_REACHABLE' || echo 'IP_BLOCKED'",
      ],
      limits: { maxRuntimeSec: 10, maxMemoryMb: 128 },
      networkMode: {
        mode: "internal",
        networkName: SANDBOX_INTERNAL_NETWORK,
      },
    });

    expect(result.stdout).toContain("IP_BLOCKED");
    expect(result.stdout).not.toContain("IP_REACHABLE");
  });

  it("container cannot access Docker socket", async () => {
    // Try to access Docker socket - should not exist in container
    const result = await runner.runOnce({
      runId: uniqueRunId("test-no-docker-socket"),
      workspacePath: workspace,
      argv: [
        "bash",
        "-lc",
        "ls -la /var/run/docker.sock 2>&1 && echo 'SOCKET_EXISTS' || echo 'NO_SOCKET'",
      ],
      limits: { maxRuntimeSec: 10, maxMemoryMb: 128 },
      networkMode: {
        mode: "internal",
        networkName: SANDBOX_INTERNAL_NETWORK,
      },
    });

    // Docker socket should not be mounted in sandbox containers
    expect(result.stdout).toContain("NO_SOCKET");
    expect(result.stdout).not.toContain("SOCKET_EXISTS");
  });

  it("container CAN resolve litellm DNS (internal network works)", async () => {
    // Verify litellm DNS resolution works - proves internal DNS works while external doesn't
    const result = await runner.runOnce({
      runId: uniqueRunId("test-litellm-dns"),
      workspacePath: workspace,
      argv: [
        "bash",
        "-lc",
        "getent hosts litellm 2>&1 && echo 'LITELLM_RESOLVED' || echo 'LITELLM_NOT_RESOLVED'",
      ],
      limits: { maxRuntimeSec: 10, maxMemoryMb: 128 },
      networkMode: {
        mode: "internal",
        networkName: SANDBOX_INTERNAL_NETWORK,
      },
    });

    expect(result.stdout).toContain("LITELLM_RESOLVED");
  });
});
