// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import {
  type DeploymentEnvironment,
  resolveNodeDeploymentProvider,
} from "./node-deployment-provider";

export interface DeploymentTargetSelection {
  readonly deployment: readonly string[];
  readonly substrate: readonly string[];
  readonly external: readonly string[];
  readonly providers: Readonly<Record<string, "akash" | "k3s">>;
}

/** Partition one flight once; downstream matrix cells reuse this exact decision. */
export function resolveDeploymentTargets(input: {
  readonly catalogRows: readonly Readonly<Record<string, unknown>>[];
  readonly environment: DeploymentEnvironment;
  readonly flightTargets: readonly string[];
}): DeploymentTargetSelection {
  const byName = new Map(
    input.catalogRows.map((row) => [row.name, row] as const)
  );
  const providers: Record<string, "akash" | "k3s"> = {};
  const deployment: string[] = [];
  const substrate: string[] = [];
  const external: string[] = [];

  for (const target of input.flightTargets) {
    const row = byName.get(target);
    if (!row)
      throw new Error(`[deployment-targets] Unknown flight target: ${target}`);
    const provider = resolveNodeDeploymentProvider({
      catalog: row,
      environment: input.environment,
    });
    providers[target] = provider;
    if (row.type !== "node") continue;
    deployment.push(target);
    // Every node needs the existing common substrate (generated OpenBao
    // values plus shared DB/state provisioning), regardless of where its app
    // containers run. Placement only chooses the app runtime.
    substrate.push(target);
    if (provider === "akash") external.push(target);
  }

  return { deployment, substrate, external, providers };
}
