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

describe("AkashComputeAdapter preferredProviders", () => {
  const bid = (provider: string, amount: string) => ({
    bid: {
      id: { dseq: "77", gseq: 1, oseq: 1, provider },
      state: "open",
      price: { denom: "uakt", amount },
    },
  });

  function provisionFetch(bidWaves: unknown[][], leased: string[]) {
    let wave = 0;
    return vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/v1/deployments") && init?.method === "POST") {
        return jsonResponse({ data: { dseq: "77", manifest: [] } });
      }
      if (u.includes("/v1/bids")) {
        const bids = bidWaves[Math.min(wave, bidWaves.length - 1)];
        wave += 1;
        return jsonResponse({ data: bids });
      }
      if (u.endsWith("/v1/leases") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          leases: { provider: string }[];
        };
        leased.push(body.leases[0]?.provider ?? "");
        return jsonResponse({ data: {} });
      }
      if (init?.method === "DELETE")
        return jsonResponse({ data: { success: true } });
      return jsonResponse({
        data: {
          deployment: { state: "active" },
          leases: [{ state: "active" }],
        },
      });
    });
  }

  it("leases the preferred provider over a cheaper stranger", async () => {
    const leased: string[] = [];
    const fetchImpl = provisionFetch(
      [[bid("akash1stranger", "100"), bid("akash1preferred", "900")]],
      leased
    );
    await makeAdapter(fetchImpl, {
      bidTimeoutMs: 1000,
      preferredProviders: ["akash1preferred"],
    }).provision({ env: "t", spec: SPEC });
    expect(leased).toEqual(["akash1preferred"]);
  });

  it("waits past a stranger-only wave and takes the preferred bid on a later poll", async () => {
    const leased: string[] = [];
    const fetchImpl = provisionFetch(
      [
        [bid("akash1stranger", "100")],
        [bid("akash1stranger", "100"), bid("akash1preferred", "900")],
      ],
      leased
    );
    await makeAdapter(fetchImpl, {
      bidTimeoutMs: 60_000,
      preferredProviders: ["akash1preferred"],
    }).provision({ env: "t", spec: SPEC });
    expect(leased).toEqual(["akash1preferred"]);
  });

  it("falls back to the cheapest stranger when the window closes without a preferred bid", async () => {
    const leased: string[] = [];
    const fetchImpl = provisionFetch(
      [[bid("akash1stranger", "100"), bid("akash1pricier", "500")]],
      leased
    );
    await makeAdapter(fetchImpl, {
      bidTimeoutMs: 0,
      preferredProviders: ["akash1preferred"],
    }).provision({ env: "t", spec: SPEC });
    expect(leased).toEqual(["akash1stranger"]);
  });
});

describe("AkashComputeAdapter failure containment", () => {
  it("closes the deployment (refund) and names the dseq when no bids arrive", async () => {
    const deletes: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/v1/deployments") && init?.method === "POST") {
        return jsonResponse({ data: { dseq: "88", manifest: [] } });
      }
      if (init?.method === "DELETE") {
        deletes.push(u);
        return jsonResponse({ data: { success: true } });
      }
      return jsonResponse({ data: [] }); // bids: always empty
    });

    const err = await makeAdapter(fetchImpl)
      .provision({ env: "t", spec: SPEC })
      .catch((e: unknown) => e);

    expect((err as AkashComputeError).code).toBe("NO_BIDS");
    expect((err as AkashComputeError).message).toContain("88");
    expect(deletes).toEqual([`${BASE}/v1/deployments/88`]);
  });

  it("returns pending instead of throwing when the post-lease status read fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/v1/deployments") && init?.method === "POST") {
        return jsonResponse({ data: { dseq: "99", manifest: [] } });
      }
      if (u.includes("/v1/bids")) {
        return jsonResponse({
          data: [
            {
              bid: {
                id: { dseq: "99", gseq: 1, oseq: 1, provider: "akash1p" },
                state: "open",
                price: { denom: "uakt", amount: "5" },
              },
            },
          ],
        });
      }
      if (u.endsWith("/v1/leases") && init?.method === "POST") {
        return jsonResponse({ data: {} });
      }
      return jsonResponse({ error: "boom" }, 500); // status read fails
    });

    const out = await makeAdapter(fetchImpl).provision({
      env: "t",
      spec: SPEC,
    });
    expect(out).toEqual({
      provider: "akash",
      leaseId: "99",
      state: "pending",
      endpoints: [],
    });
  });

  it("never echoes raw response bodies in HTTP_ERROR (only parsed message fields)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          '{"message":"invalid manifest","echo":"AUTH_SECRET=supersecret"}',
          {
            status: 422,
            statusText: "Unprocessable Entity",
          }
        )
    );
    const err = await makeAdapter(fetchImpl)
      .balances()
      .catch((e: unknown) => e);
    const msg = (err as AkashComputeError).message;
    expect(msg).toContain("422");
    expect(msg).toContain("invalid manifest");
    expect(msg).not.toContain("supersecret");
  });
});
