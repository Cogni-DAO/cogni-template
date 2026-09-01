// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it } from "vitest";

import { resolveDeploymentTargets } from "./node-deployment-targets";

describe("resolveDeploymentTargets", () => {
  it("keeps omitted placement on k3s and separates explicit external nodes", () => {
    expect(
      resolveDeploymentTargets({
        catalogRows: [
          { name: "node-template", type: "node" },
          {
            name: "toks4",
            type: "node",
            deployment_provider: { "candidate-a": "akash" },
          },
          { name: "scheduler-worker", type: "service" },
        ],
        environment: "candidate-a",
        flightTargets: ["node-template", "toks4", "scheduler-worker"],
      })
    ).toEqual({
      deployment: ["node-template", "toks4"],
      substrate: ["node-template"],
      external: ["toks4"],
      providers: {
        "node-template": "k3s",
        toks4: "akash",
        "scheduler-worker": "k3s",
      },
    });
  });

  it("fails closed for a target absent from the reviewed catalog", () => {
    expect(() =>
      resolveDeploymentTargets({
        catalogRows: [],
        environment: "candidate-a",
        flightTargets: ["unreviewed"],
      })
    ).toThrow("Unknown flight target");
  });
});
