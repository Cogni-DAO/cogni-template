// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/bootstrap/resolve-routable-node-governance-configs`
 * Purpose: Pin singleton activity authority during multi-environment schedule resolution.
 * Scope: Pure injected registry rows; no Postgres, Temporal, or GitHub IO.
 * Invariants: LOCAL_ACTIVITY_AUTHORITY_ONLY, ONE_EPOCH_SCHEDULER_PER_NODE.
 * Side-effects: none
 * Links: src/bootstrap/jobs/resolveRoutableNodeGovernanceConfigs.ts, task.5025
 * @internal
 */

import { describe, expect, it } from "vitest";

import { resolveRoutableNodeGovernanceConfigs } from "@/bootstrap/jobs/resolveRoutableNodeGovernanceConfigs";

const row = (
  slug: string,
  deployEnvs: readonly string[],
  activityEnv: string
) => ({
  id: `${slug}-node-id`,
  slug,
  deployEnvs,
  activityEnv,
});

describe("resolveRoutableNodeGovernanceConfigs — local activity authority", () => {
  it("schedules only the locally deployed row whose activity_env matches this environment", async () => {
    const configs = await resolveRoutableNodeGovernanceConfigs({
      deployEnvironment: "candidate-a",
      listRows: async () => [
        row(
          "candidate-authority",
          ["candidate-a", "production"],
          "candidate-a"
        ),
        row("foreign-authority", ["candidate-a", "production"], "production"),
        row("not-deployed-here", ["production"], "candidate-a"),
      ],
    });

    expect(configs.map(({ slug }) => slug)).toEqual(["candidate-authority"]);
  });

  it("does not double-schedule a multi-env node from the non-authoritative environment", async () => {
    const multiEnvNode = row(
      "one-ledger",
      ["candidate-a", "production"],
      "candidate-a"
    );

    const candidate = await resolveRoutableNodeGovernanceConfigs({
      deployEnvironment: "candidate-a",
      listRows: async () => [multiEnvNode],
    });
    const production = await resolveRoutableNodeGovernanceConfigs({
      deployEnvironment: "production",
      listRows: async () => [multiEnvNode],
    });

    expect(candidate).toHaveLength(1);
    expect(production).toEqual([]);
  });

  it("fails loud without a supported DEPLOY_ENVIRONMENT", async () => {
    await expect(
      resolveRoutableNodeGovernanceConfigs({
        deployEnvironment: "local",
        listRows: async () => [],
      })
    ).rejects.toThrow(/DEPLOY_ENVIRONMENT/);
  });
});
