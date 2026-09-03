// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it, vi } from "vitest";

import { ComputeWorkloadSecretResolverAdapter } from "./compute-workload-secret-resolver.adapter";

const scope = {
  nodeId: "node-one",
  nodeSlug: "sample-node",
  environment: "candidate-a",
  serviceName: "app",
  sourceSha: "a".repeat(40),
};

describe("ComputeWorkloadSecretResolverAdapter", () => {
  it("derives node/env scope and resolves a newly declared node-owned key", async () => {
    const readNamespacedSecret = vi.fn(async () => ({
      body: {
        data: {
          SOME_BRAND_NEW_VENDOR_KEY: Buffer.from("private").toString("base64"),
        },
      },
    }));
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      { readNamespacedSecret } as never,
      "cogni-candidate-a"
    );
    await expect(
      resolver.resolve({
        ...scope,
        refs: [{ key: "SOME_BRAND_NEW_VENDOR_KEY" }],
      })
    ).resolves.toEqual({ SOME_BRAND_NEW_VENDOR_KEY: "private" });
    expect(readNamespacedSecret).toHaveBeenCalledOnce();
    expect(readNamespacedSecret).toHaveBeenCalledWith(
      "sample-node-compute-env-secrets",
      "cogni-candidate-a"
    );
  });

  it.each([
    "LITELLM_MASTER_KEY",
    "OPENROUTER_API_KEY",
    "GH_REVIEW_APP_PRIVATE_KEY_BASE64",
    "IDENTITY_ATTESTATION_PRIVATE_KEY",
    "APP_DB_PASSWORD",
    "CLOUDFLARE_API_TOKEN",
    "ACTIONS_AUTOMATION_BOT_PAT",
    "DOLT_CREDS_JWK",
    "not-shell-safe",
  ])("fails closed before reading operator/fleet-owned %s", async (key) => {
    const readNamespacedSecret = vi.fn();
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      { readNamespacedSecret } as never,
      "cogni-candidate-a"
    );
    await expect(
      resolver.resolve({ ...scope, refs: [{ key }] })
    ).rejects.toMatchObject({ reason: "SecretPolicyRejected" });
    expect(readNamespacedSecret).not.toHaveBeenCalled();
  });

  it("resolves node-owned custody keys (bug.5093 — poly to Akash)", async () => {
    // Previously SecretPolicyRejected on the key NAME. These values are minted
    // per-node at cogni/<env>/<node>/<KEY>; the node owns them, so they cross.
    const readNamespacedSecret = vi.fn(async () => ({
      body: {
        data: {
          POLY_WALLET_AEAD_KEY_HEX: Buffer.from("deadbeef").toString("base64"),
          PRIVY_APP_SECRET: Buffer.from("privy-secret").toString("base64"),
        },
      },
    }));
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      { readNamespacedSecret } as never,
      "cogni-candidate-a"
    );
    await expect(
      resolver.resolve({
        ...scope,
        refs: [
          { key: "POLY_WALLET_AEAD_KEY_HEX" },
          { key: "PRIVY_APP_SECRET" },
        ],
      })
    ).resolves.toEqual({
      POLY_WALLET_AEAD_KEY_HEX: "deadbeef",
      PRIVY_APP_SECRET: "privy-secret",
    });
  });

  it("returns the declared node-scoped virtual key under its generic logical name", async () => {
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      {
        readNamespacedSecret: vi.fn(async () => ({
          body: {
            data: {
              LITELLM_VIRTUAL_KEY: Buffer.from("sk-virtual").toString("base64"),
            },
          },
        })),
      } as never,
      "cogni-candidate-a"
    );
    await expect(
      resolver.resolve({ ...scope, refs: [{ key: "LITELLM_VIRTUAL_KEY" }] })
    ).resolves.toEqual({ LITELLM_VIRTUAL_KEY: "sk-virtual" });
  });

  it("retries when ESO has not materialized a declared key yet", async () => {
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      {
        readNamespacedSecret: vi.fn(async () => ({ body: { data: {} } })),
      } as never,
      "cogni-candidate-a"
    );

    await expect(
      resolver.resolve({ ...scope, refs: [{ key: "LITELLM_VIRTUAL_KEY" }] })
    ).rejects.toMatchObject({
      kind: "transient",
      reason: "SecretResolverUnavailable",
      retryable: true,
    });
  });

  it("treats a not-yet-materialized compute Secret as transient", async () => {
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      {
        readNamespacedSecret: vi.fn(async () => {
          throw Object.assign(new Error("not found"), { statusCode: 404 });
        }),
      } as never,
      "cogni-candidate-a"
    );

    await expect(
      resolver.resolve({ ...scope, refs: [{ key: "AUTH_SECRET" }] })
    ).rejects.toMatchObject({
      kind: "transient",
      reason: "SecretResolverUnavailable",
      retryable: true,
    });
  });

  it.each([
    "",
    "not base64!",
  ])("fails closed on invalid materialized value %j", async (encoded) => {
    const resolver = new ComputeWorkloadSecretResolverAdapter(
      {
        readNamespacedSecret: vi.fn(async () => ({
          body: { data: { AUTH_SECRET: encoded } },
        })),
      } as never,
      "cogni-candidate-a"
    );

    await expect(
      resolver.resolve({ ...scope, refs: [{ key: "AUTH_SECRET" }] })
    ).rejects.toMatchObject({
      kind: "transient",
      reason: "SecretResolverUnavailable",
      retryable: true,
    });
  });
});
