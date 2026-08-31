// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it, vi } from "vitest";
import {
  AkashComputeAdapter,
  AkashComputeError,
} from "./akash-compute.adapter";
import { buildAkashSdl } from "./akash-sdl";

const BASE = "https://console-api.akash.network";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeAdapter(
  fetchImpl: typeof fetch,
  overrides: Partial<ConstructorParameters<typeof AkashComputeAdapter>[0]> = {}
): AkashComputeAdapter {
  return new AkashComputeAdapter({
    apiKey: "console-key",
    timeoutMs: 1000,
    bidTimeoutMs: 0,
    bidPollIntervalMs: 0,
    sleepImpl: async () => {},
    fetchImpl,
    ...overrides,
  });
}

const SPEC = {
  name: "toks4",
  services: [
    {
      name: "app",
      image: "ghcr.io/cogni-dao/toks4:sha-abc",
      env: { PORT: "3000" },
      cpuUnits: 0.5,
      memoryMi: 1024,
      storageMi: 2048,
      expose: [
        { port: 3000, as: 80, global: true, hosts: ["toks4.example.org"] },
      ],
    },
    {
      name: "db",
      image: "postgres:16-alpine",
      cpuUnits: 0.25,
      memoryMi: 512,
      storageMi: 1024,
      expose: [{ port: 5432, as: 5432, global: false }],
    },
  ],
} as const;

describe("buildAkashSdl", () => {
  it("renders services, profiles, placement pricing, and deployment sections", () => {
    const sdl = buildAkashSdl(SPEC, {
      pricingDenom: "uakt",
      pricingAmount: 10_000,
    });
    expect(sdl).toContain('version: "2.0"');
    expect(sdl).toContain("ghcr.io/cogni-dao/toks4:sha-abc");
    expect(sdl).toContain("PORT=3000");
    expect(sdl).toContain("toks4.example.org");
    expect(sdl).toContain("denom: uakt");
    // global expose on app; internal expose on db routes to the sibling by name
    expect(sdl).toContain("global: true");
    expect(sdl).toContain("service: app");
    expect(sdl).not.toContain("service: db");
  });
});

describe("AkashComputeAdapter", () => {
  it("maps the managed wallet's micro-unit allowance to a USD ComputeBalance", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("console-key");
      if (String(url) === `${BASE}/v1/user/me`) {
        return jsonResponse({ data: { id: "user-1" } });
      }
      expect(String(url)).toBe(`${BASE}/v1/wallets?userId=user-1`);
      return jsonResponse({
        data: [
          {
            id: 7,
            address: "akash1abc",
            creditAmount: 100_000_000,
            denom: "uusdc",
            isTrialing: true,
          },
        ],
      });
    });

    const balances = await makeAdapter(fetchImpl).balances();

    expect(balances).toEqual([
      expect.objectContaining({
        provider: "akash",
        accountId: "akash1abc",
        currency: "USD",
        remaining: 100,
        estimatedDaysRemaining: null,
      }),
    ]);
  });

  it("provisions: creates deployment, leases the cheapest open bid, returns status", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u.replace(BASE, "")}`);
      if (u === `${BASE}/v1/deployments` && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          data: { sdl: string; deposit: number };
        };
        expect(body.data.sdl).toContain('version: "2.0"');
        expect(body.data.deposit).toBe(5);
        return jsonResponse({
          data: { dseq: "123456", manifest: [{ name: "dcloud" }] },
        });
      }
      if (u.startsWith(`${BASE}/v1/bids`)) {
        return jsonResponse({
          data: [
            {
              bid: {
                id: { dseq: "123456", gseq: 1, oseq: 1, provider: "akash1exp" },
                state: "open",
                price: { denom: "uakt", amount: "900" },
              },
            },
            {
              bid: {
                id: {
                  dseq: "123456",
                  gseq: 1,
                  oseq: 1,
                  provider: "akash1cheap",
                },
                state: "open",
                price: { denom: "uakt", amount: "150" },
              },
            },
          ],
        });
      }
      if (u === `${BASE}/v1/leases` && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          manifest: unknown;
          leases: { provider: string }[];
        };
        expect(body.manifest).toEqual([{ name: "dcloud" }]);
        expect(body.leases[0]?.provider).toBe("akash1cheap");
        return jsonResponse({ data: {} });
      }
      expect(u).toBe(`${BASE}/v1/deployments/123456`);
      return jsonResponse({
        data: {
          deployment: { state: "active" },
          leases: [
            {
              state: "active",
              status: {
                services: { app: { uris: ["toks4.provider.akash.pub"] } },
              },
            },
          ],
        },
      });
    });

    const out = await makeAdapter(fetchImpl).provision({
      env: "shared",
      spec: SPEC,
    });

    expect(out).toEqual({
      provider: "akash",
      leaseId: "123456",
      state: "active",
      endpoints: ["toks4.provider.akash.pub"],
    });
    expect(calls[0]).toBe("POST /v1/deployments");
    expect(calls[1]).toContain("/v1/bids?dseq=123456");
  });

  it("throws NO_BIDS when the bid window elapses without an open bid", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u === `${BASE}/v1/deployments` && init?.method === "POST") {
        return jsonResponse({ data: { dseq: "9", manifest: [] } });
      }
      return jsonResponse({ data: [] });
    });

    await expect(
      makeAdapter(fetchImpl).provision({ env: "shared", spec: SPEC })
    ).rejects.toMatchObject({ code: "NO_BIDS" });
  });

  it("maps a closed deployment's status and releases via DELETE", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      if (init?.method === "DELETE") {
        expect(String(url)).toBe(`${BASE}/v1/deployments/42`);
        return jsonResponse({ data: { success: true } });
      }
      return jsonResponse({
        data: { deployment: { state: "closed" }, leases: [] },
      });
    });

    const adapter = makeAdapter(fetchImpl);
    const status = await adapter.status({ leaseId: "42" });
    expect(status.state).toBe("closed");
    expect(status.endpoints).toEqual([]);
    await expect(adapter.release({ leaseId: "42" })).resolves.toBeUndefined();
  });

  it("throws HTTP_ERROR with a stable code on non-2xx responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ error: "unauthorized" }, 401)
    );

    const err = await makeAdapter(fetchImpl)
      .balances()
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AkashComputeError);
    expect((err as AkashComputeError).code).toBe("HTTP_ERROR");
  });
});
