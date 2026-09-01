// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authorize = vi.fn();

vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));
vi.mock("@/app/_lib/node-rbac", () => ({
  resolveNodeAndAuthorize: authorize,
}));
vi.mock("@/bootstrap/http", () => ({
  wrapRouteHandlerWithLogging:
    (_config: unknown, handler: (...args: unknown[]) => Promise<Response>) =>
    (request: Request) =>
      handler({}, request, { id: "user-1" }),
}));

describe("POST /api/v1/compute/deployments", () => {
  beforeEach(() => authorize.mockResolvedValue({ ok: true }));

  it("cannot bypass the durable GitOps allocation coordinator", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest("https://operator.example/api/v1/compute/deployments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodeId: "123e4567-e89b-12d3-a456-426614174001",
          services: [{ name: "rogue-writer" }],
        }),
      })
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "gitops_required",
    });
  });
});
