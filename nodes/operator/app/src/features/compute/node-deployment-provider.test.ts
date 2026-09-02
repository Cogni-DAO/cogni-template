// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it } from "vitest";

import { resolveNodeDeploymentProvider } from "./node-deployment-provider";

describe("resolveNodeDeploymentProvider", () => {
  it("keeps the existing k3s path when placement is absent", () => {
    expect(
      resolveNodeDeploymentProvider({
        catalog: { name: "beacon", type: "node" },
        environment: "candidate-a",
      })
    ).toBe("k3s");
  });

  it("selects Akash only for the explicitly configured environment", () => {
    const catalog = {
      name: "node-template",
      deployment_provider: { "candidate-a": "akash" },
    };
    expect(
      resolveNodeDeploymentProvider({
        catalog,
        environment: "candidate-a",
      })
    ).toBe("akash");
    expect(
      resolveNodeDeploymentProvider({ catalog, environment: "preview" })
    ).toBe("k3s");
    expect(
      resolveNodeDeploymentProvider({ catalog, environment: "production" })
    ).toBe("k3s");
  });

  it("fails closed on unknown providers or environment keys", () => {
    expect(() =>
      resolveNodeDeploymentProvider({
        catalog: { deployment_provider: { "candidate-a": "console" } },
        environment: "candidate-a",
      })
    ).toThrow("Invalid catalog placement");
    expect(() =>
      resolveNodeDeploymentProvider({
        catalog: { deployment_provider: { staging: "akash" } },
        environment: "candidate-a",
      })
    ).toThrow("Invalid catalog placement");
  });
});
