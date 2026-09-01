// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it, vi } from "vitest";
import { OpenBaoSecretsAdapter } from "./openbao-secrets.adapter";

const ADDR = "http://openbao.openbao.svc:8200";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeAdapter(fetchImpl: typeof fetch): OpenBaoSecretsAdapter {
  return new OpenBaoSecretsAdapter({
    addr: ADDR,
    role: "candidate-a-node-secrets-writer",
    readServiceAccountToken: async () => "projected-sa-jwt",
    fetchImpl,
    retryDelayMs: 0, // no backoff sleeps in unit tests
  });
}

describe("OpenBaoSecretsAdapter", () => {
  it("self-logins then PUTs a brand-new node path (metadata 404)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/kubernetes/login")) {
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      if (u.includes("/cogni/metadata/")) return jsonResponse({}, 404);
      // data write — KV v2 requires the `data/` infix in the URL.
      expect(u).toBe(`${ADDR}/v1/cogni/data/candidate-a/poly`);
      expect(init?.method).toBe("POST");
      return jsonResponse({ data: { version: 1 } });
    });

    const result = await makeAdapter(fetchImpl).writeSecret({
      nodeSlug: "poly",
      env: "candidate-a",
      key: "POLYGON_RPC_URL",
      value: "https://rpc.example",
      op: "set",
    });

    expect(result).toEqual({
      written: true,
      version: 1,
      path: "cogni/candidate-a/poly/POLYGON_RPC_URL",
    });
    // Login carried the projected SA token, not a caller credential.
    const loginCall = fetchImpl.mock.calls.find(([u]) =>
      String(u).endsWith("/auth/kubernetes/login")
    );
    expect(JSON.parse(String(loginCall?.[1]?.body))).toMatchObject({
      role: "candidate-a-node-secrets-writer",
      jwt: "projected-sa-jwt",
    });
  });

  it("PATCHes an existing node path (metadata 200), preserving siblings", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/kubernetes/login")) {
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      if (u.includes("/cogni/metadata/")) return jsonResponse({}, 200);
      expect(u).toBe(`${ADDR}/v1/cogni/data/candidate-a/poly`);
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toMatchObject({
        "content-type": "application/merge-patch+json",
      });
      return jsonResponse({ data: { version: 7 } });
    });

    const result = await makeAdapter(fetchImpl).writeSecret({
      nodeSlug: "poly",
      env: "candidate-a",
      key: "POLYGON_RPC_URL",
      value: "https://rpc.example",
      op: "rotate",
    });
    expect(result.version).toBe(7);
  });

  it("never puts the secret value in the URL (only the JSON body)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      expect(u).not.toContain("super-secret-value");
      if (u.endsWith("/auth/kubernetes/login")) {
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      if (u.includes("/cogni/metadata/")) return jsonResponse({}, 404);
      return jsonResponse({ data: { version: 1 } });
    });
    await makeAdapter(fetchImpl).writeSecret({
      nodeSlug: "poly",
      env: "candidate-a",
      key: "POLYGON_RPC_URL",
      value: "super-secret-value",
      op: "set",
    });
  });

  it("throws a coded error when self-login fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}, 403));
    await expect(
      makeAdapter(fetchImpl).writeSecret({
        nodeSlug: "poly",
        env: "candidate-a",
        key: "POLYGON_RPC_URL",
        value: "x",
        op: "set",
      })
    ).rejects.toMatchObject({ code: "openbao_login_failed", status: 403 });
  });
});

describe("OpenBaoSecretsAdapter.readServiceSecrets (task.5054)", () => {
  it("logs in then GETs the full KV-v2 bucket (string values only)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/auth/kubernetes/login")) {
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      expect(u).toBe(`${ADDR}/v1/cogni/data/candidate-a/toks4`);
      expect(init?.method).toBe("GET");
      expect(init?.headers).toMatchObject({ "x-vault-token": "s.client" });
      return jsonResponse({
        data: {
          data: {
            AUTH_SECRET: "s3cret",
            DATABASE_URL: "postgresql://u:p@vm:5432/db",
            WEIRD_NUMBER: 42, // non-string dropped
          },
        },
      });
    });

    const map = await makeAdapter(fetchImpl).readServiceSecrets({
      service: "toks4",
      env: "candidate-a",
    });
    expect(map).toEqual({
      AUTH_SECRET: "s3cret",
      DATABASE_URL: "postgresql://u:p@vm:5432/db",
    });
  });

  it("returns null on 404 — positive absence, never retried", async () => {
    let dataGets = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/kubernetes/login")) {
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      dataGets++;
      return jsonResponse({}, 404);
    });
    const map = await makeAdapter(fetchImpl).readServiceSecrets({
      service: "ghost",
      env: "candidate-a",
    });
    expect(map).toBeNull();
    expect(dataGets).toBe(1);
  });

  it("retries a transient 5xx then succeeds (ABSENT_IS_POSITIVE, bug.5081)", async () => {
    let dataGets = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/kubernetes/login")) {
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      dataGets++;
      if (dataGets < 3) return jsonResponse({}, 503); // OpenBao load-timeout shape
      return jsonResponse({ data: { data: { AUTH_SECRET: "s3cret" } } });
    });
    const map = await makeAdapter(fetchImpl).readServiceSecrets({
      service: "toks4",
      env: "candidate-a",
    });
    expect(map).toEqual({ AUTH_SECRET: "s3cret" });
    expect(dataGets).toBe(3);
  });

  it("throws after exhausting retries — a timeout can't fake an absent bucket", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/kubernetes/login")) {
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      return jsonResponse({}, 503);
    });
    await expect(
      makeAdapter(fetchImpl).readServiceSecrets({
        service: "toks4",
        env: "candidate-a",
      })
    ).rejects.toMatchObject({ code: "openbao_read_failed", status: 503 });
  });

  it("retries login failures too", async () => {
    let logins = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      if (u.endsWith("/auth/kubernetes/login")) {
        logins++;
        if (logins < 2) return jsonResponse({}, 500);
        return jsonResponse({ auth: { client_token: "s.client" } });
      }
      return jsonResponse({ data: { data: { K: "v" } } });
    });
    const map = await makeAdapter(fetchImpl).readServiceSecrets({
      service: "toks4",
      env: "candidate-a",
    });
    expect(map).toEqual({ K: "v" });
    expect(logins).toBe(2);
  });
});
