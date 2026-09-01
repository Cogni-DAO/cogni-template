// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@adapters/server/compute/compute-dns.adapter.test`
 * Purpose: ComputeDnsReconciler behavior tests (task.5053) — graceful degradation, idempotent
 *   upsert, drift repair, CNAME-typed removal, and NEVER_THROWS error containment, against an
 *   injected fake registrar (akash-compute.adapter.test.ts style).
 * Scope: No network. The registrar seam is the injection point; @cogni/dns-ops helpers run real.
 * Links: compute-dns.adapter.ts, compute-dns-plan.ts
 */

import type {
  DnsRecord,
  DomainRegistrarPort,
  TargetedDnsPort,
} from "@cogni/dns-ops";
import { describe, expect, it, vi } from "vitest";

import { ComputeDnsReconciler } from "./compute-dns.adapter";

type FakeRegistrar = DomainRegistrarPort & TargetedDnsPort;

function makeRegistrar(
  overrides: Partial<Record<keyof FakeRegistrar, unknown>> = {}
): FakeRegistrar {
  return {
    checkAvailability: vi.fn(async () => []),
    registerDomain: vi.fn(async () => {
      throw new Error("not supported");
    }),
    getDnsRecords: vi.fn(async () => []),
    setDnsRecords: vi.fn(async () => {}),
    createRecord: vi.fn(async (record: DnsRecord) => ({
      ...record,
      id: "new",
    })),
    updateRecord: vi.fn(async (_id: string, record: DnsRecord) => record),
    deleteRecord: vi.fn(async () => {}),
    findRecords: vi.fn(async () => []),
    ...overrides,
  } as FakeRegistrar;
}

function makeReconciler(registrar: FakeRegistrar): ComputeDnsReconciler {
  return new ComputeDnsReconciler({ zone: "cognidao.org", registrar });
}

const HOST = "toks4-akash.cognidao.org";
const TARGET = "abc123.ingress.provider.io";

describe("ComputeDnsReconciler — graceful degradation", () => {
  it("reports dns_unconfigured without credentials and performs no IO", async () => {
    const reconciler = new ComputeDnsReconciler({ zone: "cognidao.org" });
    expect(reconciler.enabled).toBe(false);
    await expect(
      reconciler.reconcileDeploy({ hosts: [HOST], endpoints: [TARGET] })
    ).resolves.toEqual({ status: "skipped", reason: "dns_unconfigured" });
    await expect(
      reconciler.reconcileRelease({ slug: "toks4" })
    ).resolves.toEqual({ status: "skipped", reason: "dns_unconfigured" });
  });

  it("reports dns_unconfigured when no zone is derivable", async () => {
    const registrar = makeRegistrar();
    const reconciler = new ComputeDnsReconciler({ zone: "", registrar });
    const result = await reconciler.reconcileDeploy({
      hosts: [HOST],
      endpoints: [TARGET],
    });
    expect(result).toEqual({ status: "skipped", reason: "dns_unconfigured" });
    expect(registrar.findRecords).not.toHaveBeenCalled();
  });
});

describe("ComputeDnsReconciler — reconcileDeploy", () => {
  it("creates the CNAME when absent (proxied off, TTL 300)", async () => {
    const registrar = makeRegistrar();
    const result = await makeReconciler(registrar).reconcileDeploy({
      hosts: [HOST],
      endpoints: [TARGET],
    });
    expect(result.status).toBe("reconciled");
    expect(result.records).toEqual([
      { host: HOST, target: TARGET, action: "created" },
    ]);
    expect(registrar.createRecord).toHaveBeenCalledWith(
      {
        name: "toks4-akash",
        type: "CNAME",
        value: TARGET,
        ttl: 300,
        proxied: false,
      },
      "cognidao.org"
    );
    expect(registrar.updateRecord).not.toHaveBeenCalled();
    expect(registrar.deleteRecord).not.toHaveBeenCalled();
  });

  it("is idempotent — same target means no write at all", async () => {
    const registrar = makeRegistrar({
      findRecords: vi.fn(async () => [
        {
          id: "r1",
          name: HOST,
          type: "CNAME",
          value: TARGET,
          ttl: 300,
          proxied: false,
        } satisfies DnsRecord,
      ]),
    });
    const result = await makeReconciler(registrar).reconcileDeploy({
      hosts: [HOST],
      endpoints: [TARGET],
    });
    expect(result.status).toBe("reconciled");
    expect(result.records).toEqual([
      { host: HOST, target: TARGET, action: "unchanged" },
    ]);
    expect(registrar.createRecord).not.toHaveBeenCalled();
    expect(registrar.updateRecord).not.toHaveBeenCalled();
  });

  it("updates in place on target drift", async () => {
    const registrar = makeRegistrar({
      findRecords: vi.fn(async () => [
        {
          id: "r1",
          name: HOST,
          type: "CNAME",
          value: "old.ingress.provider.io",
          ttl: 300,
          proxied: false,
        } satisfies DnsRecord,
      ]),
    });
    const result = await makeReconciler(registrar).reconcileDeploy({
      hosts: [HOST],
      endpoints: [TARGET],
    });
    expect(result.records).toEqual([
      { host: HOST, target: TARGET, action: "updated" },
    ]);
    expect(registrar.updateRecord).toHaveBeenCalledWith(
      "r1",
      {
        name: "toks4-akash",
        type: "CNAME",
        value: TARGET,
        ttl: 300,
        proxied: false,
      },
      "cognidao.org"
    );
    expect(registrar.createRecord).not.toHaveBeenCalled();
  });

  it("skips with no_eligible_hosts and performs no IO for foreign/flight-lane hosts", async () => {
    const registrar = makeRegistrar();
    const result = await makeReconciler(registrar).reconcileDeploy({
      hosts: ["beacon-test.cognidao.org", "toks4-akash.example.net"],
      endpoints: [TARGET],
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_eligible_hosts");
    expect(result.skipped).toEqual([
      { host: "beacon-test.cognidao.org", reason: "not_akash_lane" },
      { host: "toks4-akash.example.net", reason: "foreign_zone" },
    ]);
    expect(registrar.findRecords).not.toHaveBeenCalled();
    expect(registrar.createRecord).not.toHaveBeenCalled();
  });

  it("NEVER_THROWS — registrar failure is contained into a structured error result", async () => {
    const registrar = makeRegistrar({
      findRecords: vi.fn(async () => {
        throw new Error("Cloudflare API error: 9109: invalid token");
      }),
    });
    const result = await makeReconciler(registrar).reconcileDeploy({
      hosts: [HOST],
      endpoints: [TARGET],
    });
    expect(result.status).toBe("error");
    expect(result.reason).toContain(HOST);
    expect(result.reason).toContain("invalid token");
  });
});

describe("ComputeDnsReconciler — reconcileRelease", () => {
  it("removes only the CNAME-typed `<slug>-akash` record", async () => {
    const findRecords = vi.fn(async (name?: string, type?: string) => {
      expect(name).toBe(HOST);
      expect(type).toBe("CNAME");
      return [
        {
          id: "r1",
          name: HOST,
          type: "CNAME",
          value: TARGET,
          ttl: 300,
        } satisfies DnsRecord,
      ];
    });
    const registrar = makeRegistrar({ findRecords });
    const result = await makeReconciler(registrar).reconcileRelease({
      slug: "toks4",
    });
    expect(result).toEqual({
      status: "reconciled",
      records: [{ host: HOST, action: "removed" }],
    });
    expect(registrar.deleteRecord).toHaveBeenCalledWith("r1");
  });

  it("is a no-op when the record is already gone", async () => {
    const registrar = makeRegistrar();
    const result = await makeReconciler(registrar).reconcileRelease({
      slug: "toks4",
    });
    expect(result.status).toBe("reconciled");
    expect(registrar.deleteRecord).not.toHaveBeenCalled();
  });

  it("skips ineligible slugs without touching DNS", async () => {
    const registrar = makeRegistrar();
    const result = await makeReconciler(registrar).reconcileRelease({
      slug: "bad.slug",
    });
    expect(result).toEqual({ status: "skipped", reason: "ineligible_slug" });
    expect(registrar.findRecords).not.toHaveBeenCalled();
  });

  it("NEVER_THROWS — removal failure is contained", async () => {
    const registrar = makeRegistrar({
      findRecords: vi.fn(async () => {
        throw new Error("Cloudflare API error: 10000: authentication error");
      }),
    });
    const result = await makeReconciler(registrar).reconcileRelease({
      slug: "toks4",
    });
    expect(result.status).toBe("error");
    expect(result.reason).toContain("authentication error");
  });
});
