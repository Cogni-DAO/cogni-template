// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Value-free controller boundary. Implementations derive scope and policy server-side. */
export interface ComputeWorkloadSecretResolverPort {
  resolve(input: {
    nodeId: string;
    nodeSlug: string;
    environment: string;
    serviceName: string;
    sourceSha: string;
    refs: readonly { key: string }[];
  }): Promise<Readonly<Record<string, string>>>;
}
