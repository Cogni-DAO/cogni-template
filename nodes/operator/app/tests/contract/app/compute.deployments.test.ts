// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/contract/app/compute.deployments`
 * Purpose: Contract tests for POST /api/v1/compute/deployments catalog resolution.
 * Scope: Route shell with authz, deploy-plane, and compute ports mocked; no network or spend.
 * Invariants:
 *   - CATALOG_SOURCE_IS_CONTROL_REPO: candidate resolves artifacts from the configured real catalog,
 *     not the throwaway node-formation parent.
 *   - PARTIAL_OVERRIDE_FAILS_CLOSED: a mixed repository identity never reaches artifact or spend IO.
 * Side-effects: none
 * Links: task.5063, src/app/api/v1/compute/deployments/route.ts
 * @internal
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const NODE_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_SHA = "0123456789012345678901234567890123456789";

const envState = vi.hoisted(() => ({
  current: {
    NODE_REGISTRY_CATALOG_OWNER: "Cogni-DAO",
    NODE_REGISTRY_CATALOG_REPO: "cogni",
    NODE_SUBMODULE_PARENT_OWNER: "cogni-test-org",
    NODE_SUBMODULE_PARENT_REPO: "cogni-monorepo",
  } as {
    NODE_REGISTRY_CATALOG_OWNER?: string;
    NODE_REGISTRY_CATALOG_REPO?: string;
    NODE_SUBMODULE_PARENT_OWNER?: string;
    NODE_SUBMODULE_PARENT_REPO?: string;
  },
}));
const mockResolveNodeAndAuthorize = vi.hoisted(() => vi.fn());
const mockPrepare = vi.hoisted(() => vi.fn());
const mockProvision = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/node-rbac", () => ({
  resolveNodeAndAuthorize: (...args: unknown[]) =>
    mockResolveNodeAndAuthorize(...args),
}));
vi.mock("@/bootstrap/capabilities/operator-deploy-plane", () => ({
  createCatalogControlDeployPlane: () => ({
    prepareNodeRefCandidateFlight: mockPrepare,
  }),
}));
vi.mock("@/bootstrap/container", () => ({
  getContainer: () => ({
    computeCapability: { provision: mockProvision },
  }),
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (
      _options: unknown,
      handler: (
        ctx: { log: Record<string, never> },
        request: Request,
        user: { id: string }
      ) => Promise<Response>
    ) =>
    (request: Request) =>
      handler({ log: {} }, request, { id: "user-1" }),
}));
vi.mock("@/shared/env", () => ({
  serverEnv: () => envState.current,
}));

import { POST } from "@/app/api/v1/compute/deployments/route";

function request(): Request {
  return new Request("https://test.cognidao.org/api/v1/compute/deployments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nodeId: NODE_ID, sourceSha: SOURCE_SHA }),
  });
}

describe("POST /api/v1/compute/deployments catalog resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.current = {
      NODE_REGISTRY_CATALOG_OWNER: "Cogni-DAO",
      NODE_REGISTRY_CATALOG_REPO: "cogni",
      NODE_SUBMODULE_PARENT_OWNER: "cogni-test-org",
      NODE_SUBMODULE_PARENT_REPO: "cogni-monorepo",
    };
    mockResolveNodeAndAuthorize.mockResolvedValue({
      ok: true,
      node: { nodeId: NODE_ID, slug: "node-template" },
    });
    mockPrepare.mockResolvedValue({
      nodeId: NODE_ID,
      slug: "node-template",
      sourceSha: SOURCE_SHA,
      sourceRepo: "https://github.com/Cogni-DAO/node-template.git",
      image: `ghcr.io/cogni-dao/node-template:sha-${SOURCE_SHA}`,
    });
    mockProvision.mockResolvedValue({
      provider: "compute",
      leaseId: "lease-1",
      state: "pending",
      endpoints: [],
    });
  });

  it("resolves the candidate artifact from the real catalog before provisioning", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mockPrepare).toHaveBeenCalledWith({
      parentOwner: "Cogni-DAO",
      parentRepo: "cogni",
      nodeId: NODE_ID,
      slug: "node-template",
      sourceSha: SOURCE_SHA,
    });
    expect(mockProvision).toHaveBeenCalledWith(
      expect.objectContaining({
        spec: expect.objectContaining({
          services: [
            expect.objectContaining({
              image: `ghcr.io/cogni-dao/node-template:sha-${SOURCE_SHA}`,
            }),
          ],
        }),
      })
    );
  });

  it("rejects a partial catalog override before artifact or provider IO", async () => {
    envState.current.NODE_REGISTRY_CATALOG_REPO = undefined;

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "deploy_plane_unconfigured",
    });
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockProvision).not.toHaveBeenCalled();
  });
});
