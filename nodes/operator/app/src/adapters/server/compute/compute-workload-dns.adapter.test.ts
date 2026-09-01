// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import type { DnsRecord, TargetedDnsPort } from "@cogni/dns-ops";
import { describe, expect, it, vi } from "vitest";

import { CloudflareComputeWorkloadDnsAdapter } from "./compute-workload-dns.adapter";

function dns(existing: DnsRecord[] = []) {
  return {
    findRecords: vi.fn(async () => existing),
    createRecord: vi.fn(async (record: DnsRecord) => record),
    updateRecord: vi.fn(async (_id: string, record: DnsRecord) => record),
    deleteRecord: vi.fn(async () => {}),
  } satisfies TargetedDnsPort;
}

describe("CloudflareComputeWorkloadDnsAdapter", () => {
  it("idempotently owns the normal environment hostname", async () => {
    const port = dns();
    const adapter = new CloudflareComputeWorkloadDnsAdapter({
      apiToken: "unused",
      zoneId: "unused",
      dns: port,
    });
    await adapter.reconcile({
      hostname: "toks4-test.cognidao.org",
      target: "provider.example",
    });
    expect(port.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "toks4-test.cognidao.org",
        value: "provider.example",
        type: "CNAME",
      }),
      "toks4-test.cognidao.org"
    );
  });

  it("cuts the catalog-selected normal hostname over from A to CNAME", async () => {
    const port = dns([
      {
        id: "record-1",
        name: "toks4-test.cognidao.org",
        type: "A",
        value: "192.0.2.10",
      },
    ]);
    const adapter = new CloudflareComputeWorkloadDnsAdapter({
      apiToken: "unused",
      zoneId: "unused",
      dns: port,
    });
    await adapter.reconcile({
      hostname: "toks4-test.cognidao.org",
      target: "provider.example",
    });
    expect(port.updateRecord).toHaveBeenCalledWith(
      "record-1",
      expect.objectContaining({ type: "CNAME", value: "provider.example" }),
      "toks4-test.cognidao.org"
    );
  });

  it("deletes only the exact target recorded in CR status", async () => {
    const port = dns([
      {
        id: "record-1",
        name: "toks4-test.cognidao.org",
        type: "CNAME",
        value: "provider.example",
      },
    ]);
    const adapter = new CloudflareComputeWorkloadDnsAdapter({
      apiToken: "unused",
      zoneId: "unused",
      dns: port,
    });
    await expect(
      adapter.deleteOwned({
        hostname: "toks4-test.cognidao.org",
        expectedTarget: "provider.example",
      })
    ).resolves.toBe("deleted");
    expect(port.deleteRecord).toHaveBeenCalledWith("record-1");
  });

  it("fails closed when another owner changed the record", async () => {
    const port = dns([
      {
        id: "record-1",
        name: "toks4-test.cognidao.org",
        type: "CNAME",
        value: "new-owner.example",
      },
    ]);
    const adapter = new CloudflareComputeWorkloadDnsAdapter({
      apiToken: "unused",
      zoneId: "unused",
      dns: port,
    });
    await expect(
      adapter.deleteOwned({
        hostname: "toks4-test.cognidao.org",
        expectedTarget: "provider.example",
      })
    ).rejects.toMatchObject({ reason: "DnsOwnershipChanged" });
    expect(port.deleteRecord).not.toHaveBeenCalled();
  });
});
