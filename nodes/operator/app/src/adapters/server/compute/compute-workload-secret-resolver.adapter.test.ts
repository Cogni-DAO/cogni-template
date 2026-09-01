// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it, vi } from "vitest";

import {
  ComputeWorkloadSecretResolverAdapter,
  EXTERNAL_WORKLOAD_SECRET_KEYS,
  LiteLlmVirtualKeyMinter,
  NEVER_EXTERNAL_WORKLOAD_SECRET_KEYS,
} from "./compute-workload-secret-resolver.adapter";

const scope = {
  nodeId: "node-one",
  nodeSlug: "poly",
  environment: "candidate-a",
  serviceName: "app",
  sourceSha: "a".repeat(40),
};

describe("ComputeWorkloadSecretResolverAdapter", () => {
  it("keeps the allow and custody-deny policies disjoint", () => {
    expect(
      [...EXTERNAL_WORKLOAD_SECRET_KEYS].filter((key) =>
        NEVER_EXTERNAL_WORKLOAD_SECRET_KEYS.has(key)
      )
    ).toEqual([]);
  });

  it("derives node/env scope and resolves only declared safe keys", async () => {
    const readNodeSecrets = vi.fn(async () => ({ AUTH_SECRET: "private" }));
    const resolver = new ComputeWorkloadSecretResolverAdapter({
      readNodeSecrets,
    });
    await expect(
      resolver.resolve({ ...scope, refs: [{ key: "AUTH_SECRET" }] })
    ).resolves.toEqual({ AUTH_SECRET: "private" });
    expect(readNodeSecrets).toHaveBeenCalledWith({
      nodeSlug: "poly",
      env: "candidate-a",
    });
  });

  it.each([
    "LITELLM_MASTER_KEY",
    "PRIVY_APP_SECRET",
    "UNREVIEWED_KEY",
  ])("fails closed before reading or minting %s", async (key) => {
    const readNodeSecrets = vi.fn(async () => ({}));
    const resolver = new ComputeWorkloadSecretResolverAdapter({
      readNodeSecrets,
    });
    await expect(
      resolver.resolve({ ...scope, refs: [{ key }] })
    ).rejects.toMatchObject({ reason: "SecretPolicyRejected" });
    expect(readNodeSecrets).not.toHaveBeenCalled();
  });

  it("maps the logical virtual-key ref server-side without exposing the master key", async () => {
    const mint = vi.fn(async () => "sk-virtual");
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      { readNodeSecrets: vi.fn(async () => ({})) },
      { mint }
    );
    await expect(
      resolver.resolve({ ...scope, refs: [{ key: "LITELLM_VIRTUAL_KEY" }] })
    ).resolves.toEqual({ LITELLM_MASTER_KEY: "sk-virtual" });
    expect(mint).toHaveBeenCalledWith({
      nodeId: "node-one",
      serviceName: "app",
      sourceSha: "a".repeat(40),
    });
  });

  it("mints the centralized budget-capped LiteLLM payload", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.headers).toMatchObject({
        authorization: "Bearer sk-master",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        key_alias: "external-node-one-app",
        max_budget: 25,
        budget_duration: "30d",
        metadata: {
          node_id: "node-one",
          service: "app",
          source_sha: "a".repeat(40),
        },
      });
      return new Response(JSON.stringify({ key: "sk-virtual" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    await expect(
      new LiteLlmVirtualKeyMinter(
        "http://litellm:4000",
        "sk-master",
        fetchImpl
      ).mint({
        nodeId: "node-one",
        serviceName: "app",
        sourceSha: "a".repeat(40),
      })
    ).resolves.toBe("sk-virtual");
  });
});
