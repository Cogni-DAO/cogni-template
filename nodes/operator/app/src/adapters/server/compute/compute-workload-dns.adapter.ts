// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import {
  CloudflareAdapter,
  type DnsRecord,
  type TargetedDnsPort,
} from "@cogni/dns-ops";

import { ComputeLifecycleError, type ComputeWorkloadDnsPort } from "@/ports";

const CNAME_TTL_SECONDS = 300;

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export class CloudflareComputeWorkloadDnsAdapter
  implements ComputeWorkloadDnsPort
{
  private readonly dns: TargetedDnsPort;

  constructor(input: {
    apiToken: string;
    zoneId: string;
    dns?: TargetedDnsPort;
  }) {
    this.dns =
      input.dns ??
      new CloudflareAdapter({ apiToken: input.apiToken, zoneId: input.zoneId });
  }

  async reconcile(input: { hostname: string; target: string }): Promise<void> {
    assertNonProtectedHostname(input.hostname);
    const live = await this.find(input.hostname);
    const desired: DnsRecord = {
      name: input.hostname,
      type: "CNAME",
      value: normalized(input.target),
      ttl: CNAME_TTL_SECONDS,
      proxied: true,
    };
    if (live.length > 1) {
      throw new ComputeLifecycleError("terminal", "DnsOwnershipChanged", false);
    }
    const current = live[0];
    if (current && !["A", "AAAA", "CNAME"].includes(current.type)) {
      throw new ComputeLifecycleError("terminal", "DnsOwnershipChanged", false);
    }
    if (
      current &&
      normalized(current.value) === desired.value &&
      current.proxied === true
    ) {
      return;
    }
    try {
      if (current?.id) {
        await this.dns.updateRecord(current.id, desired, input.hostname);
      } else if (!current) {
        await this.dns.createRecord(desired, input.hostname);
      } else {
        throw new ComputeLifecycleError(
          "terminal",
          "DnsOwnershipChanged",
          false
        );
      }
    } catch (error) {
      if (error instanceof ComputeLifecycleError) throw error;
      throw new ComputeLifecycleError("transient", "DnsReconcileFailed", true);
    }
  }

  async deleteOwned(input: {
    hostname: string;
    expectedTarget: string;
  }): Promise<"deleted" | "absent"> {
    const live = await this.find(input.hostname);
    if (live.length === 0) return "absent";
    if (
      live.length !== 1 ||
      !live[0]?.id ||
      normalized(live[0].value) !== normalized(input.expectedTarget)
    ) {
      throw new ComputeLifecycleError("terminal", "DnsOwnershipChanged", false);
    }
    try {
      await this.dns.deleteRecord(live[0].id);
      return "deleted";
    } catch {
      throw new ComputeLifecycleError("transient", "DnsReconcileFailed", true);
    }
  }

  private async find(hostname: string): Promise<DnsRecord[]> {
    try {
      return await this.dns.findRecords(hostname);
    } catch {
      throw new ComputeLifecycleError("transient", "DnsReconcileFailed", true);
    }
  }
}

function assertNonProtectedHostname(hostname: string): void {
  const labels = normalized(hostname).split(".");
  if (labels.length < 3 || labels[0] === "www") {
    throw new ComputeLifecycleError("terminal", "DnsOwnershipChanged", false);
  }
}

export class DormantComputeWorkloadDnsAdapter
  implements ComputeWorkloadDnsPort
{
  private unavailable(): never {
    throw new ComputeLifecycleError("terminal", "DnsCredentialMissing", false);
  }
  reconcile(): Promise<void> {
    return this.unavailable();
  }
  deleteOwned(): Promise<"deleted" | "absent"> {
    return this.unavailable();
  }
}
