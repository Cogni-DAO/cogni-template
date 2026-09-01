// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/bootstrap/operator-deploy-plane`
 * Purpose: Verify credential isolation between general VCS authority and catalog control.
 * Scope: Bootstrap selection only; GitHub adapter mocked, no network.
 * Invariants: CANDIDATE_CONTROL_IS_CAPABILITY_SCOPED, CREDENTIAL_PAIR_IS_ATOMIC.
 * Side-effects: none
 * Links: task.5063, src/bootstrap/capabilities/operator-deploy-plane.ts
 * @internal
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerEnv } from "@/shared/env";

const constructorCalls = vi.hoisted(() => [] as unknown[]);

vi.mock("@/adapters/server", () => ({
  GitHubRepoWriter: class GitHubRepoWriter {
    constructor(config: unknown) {
      constructorCalls.push(config);
    }
  },
}));

import {
  createCatalogControlDeployPlane,
  createOperatorDeployPlane,
} from "@/bootstrap/capabilities/operator-deploy-plane";

function env(overrides: Record<string, unknown> = {}): ServerEnv {
  return {
    GH_REVIEW_APP_ID: "review-app",
    GH_REVIEW_APP_PRIVATE_KEY_BASE64:
      Buffer.from("review-key").toString("base64"),
    ...overrides,
  } as unknown as ServerEnv;
}

describe("operator deploy-plane credential selection", () => {
  beforeEach(() => {
    constructorCalls.length = 0;
  });

  it("uses the capability-scoped App only for catalog control", () => {
    const config = env({
      GH_CANDIDATE_CONTROL_APP_ID: "candidate-control-app",
      GH_CANDIDATE_CONTROL_APP_PRIVATE_KEY_BASE64: Buffer.from(
        "candidate-control-key"
      ).toString("base64"),
    });

    createCatalogControlDeployPlane(config);
    createOperatorDeployPlane(config);

    expect(constructorCalls).toEqual([
      { appId: "candidate-control-app", privateKey: "candidate-control-key" },
      { appId: "review-app", privateKey: "review-key" },
    ]);
  });

  it("preserves production behavior by falling back to the review App", () => {
    createCatalogControlDeployPlane(env());

    expect(constructorCalls).toEqual([
      { appId: "review-app", privateKey: "review-key" },
    ]);
  });

  it("fails closed when the candidate control credential pair is partial", () => {
    expect(() =>
      createCatalogControlDeployPlane(
        env({ GH_CANDIDATE_CONTROL_APP_ID: "candidate-control-app" })
      )
    ).toThrow(/must be set together/);
    expect(constructorCalls).toHaveLength(0);
  });
});
