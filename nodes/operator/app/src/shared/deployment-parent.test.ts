// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it } from "vitest";

import {
  assertDeploymentParent,
  deploymentParentForEnv,
  deploymentParentRepoUrl,
} from "./deployment-parent";

describe("deployment parent contract", () => {
  it("isolates candidate-a in test-org while preview and production stay canonical", () => {
    expect(deploymentParentForEnv("candidate-a")).toEqual({
      owner: "cogni-test-org",
      repo: "cogni-monorepo",
    });
    expect(deploymentParentForEnv("preview")).toEqual({
      owner: "cogni-dao",
      repo: "cogni",
    });
    expect(deploymentParentForEnv("production")).toEqual({
      owner: "cogni-dao",
      repo: "cogni",
    });
  });

  it("formats the one Git URL used by Argo and generated AppSets", () => {
    expect(deploymentParentRepoUrl(deploymentParentForEnv("candidate-a"))).toBe(
      "https://github.com/cogni-test-org/cogni-monorepo.git"
    );
  });

  it("returns the narrowed runtime environment after validation", () => {
    expect(
      assertDeploymentParent({
        env: "production",
        owner: "cogni-dao",
        repo: "cogni",
      })
    ).toEqual({ env: "production", owner: "cogni-dao", repo: "cogni" });
  });

  it("fails closed on runtime parent drift", () => {
    expect(() =>
      assertDeploymentParent({
        env: "candidate-a",
        owner: "cogni-dao",
        repo: "cogni",
      })
    ).toThrow(
      "deployment parent mismatch for candidate-a: expected cogni-test-org/cogni-monorepo, got cogni-dao/cogni"
    );
  });
});
