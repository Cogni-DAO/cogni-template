// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/app/api/nodes-id-route`
 * Purpose: Unit coverage for PATCH /api/v1/nodes/[id] wizard event parsing.
 * Scope: Mocks auth + DB leaves; exercises the real route schema and node state machine.
 * Side-effects: none
 * Links: src/app/api/v1/nodes/[id]/route.ts, src/features/nodes/state-machine.ts
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NodeStatus } from "@/shared/db/nodes";

const dbState = vi.hoisted(() => ({
  current: undefined as
    | {
        id: string;
        ownerUserId: string;
        status: NodeStatus;
        failureReason: string | null;
      }
    | undefined,
  patch: undefined as
    | {
        status?: NodeStatus;
        failureReason?: string | null;
        distributionBudgetTotalCredits?: number;
      }
    | undefined,
}));

const mockGetServerSessionUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/server", () => ({
  getServerSessionUser: (...args: unknown[]) =>
    mockGetServerSessionUser(...args),
}));

vi.mock("@/bootstrap/container", () => ({
  resolveAppDb: () => ({}),
}));

vi.mock("@cogni/db-client", () => ({
  withTenantScope: async (
    _db: unknown,
    _actor: unknown,
    run: (tx: unknown) => unknown
  ) => run(mockTx),
}));

const mockTx = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => (dbState.current ? [dbState.current] : []),
      }),
    }),
  }),
  update: () => ({
    set: (patch: typeof dbState.patch) => {
      dbState.patch = patch;
      return {
        where: () => ({
          returning: () => [{ ...dbState.current, ...patch }],
        }),
      };
    },
  }),
};

import { PATCH } from "@/app/api/v1/nodes/[id]/route";

function patchRequest(
  eventType: string,
  fields: Record<string, unknown> = {}
): Request {
  return new Request("https://test.local/api/v1/nodes/node-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: { type: eventType }, ...fields }),
  });
}

describe("PATCH /api/v1/nodes/[id]", () => {
  beforeEach(() => {
    dbState.current = {
      id: "node-1",
      ownerUserId: "user-1",
      status: "dao_pending",
      failureReason: null,
    };
    dbState.patch = undefined;
    mockGetServerSessionUser.mockReset();
    mockGetServerSessionUser.mockResolvedValue({ id: "user-1" });
  });

  it.each([
    ["published", "wallet_provisioned", "wallet_ready"],
  ] as const)("accepts %s + %s and advances to %s", async (currentStatus, eventType, nextStatus) => {
    if (dbState.current) dbState.current.status = currentStatus;

    const response = await PATCH(patchRequest(eventType), {
      params: Promise.resolve({ id: "node-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(dbState.patch?.status).toBe(nextStatus);
    expect(body.node.status).toBe(nextStatus);
  });

  it.each([
    "payments_configured",
    "activation_published",
  ] as const)("rejects browser-declared %s readiness events", async (eventType) => {
    if (dbState.current) dbState.current.status = "wallet_ready";

    const response = await PATCH(patchRequest(eventType), {
      params: Promise.resolve({ id: "node-1" }),
    });

    expect(response.status).toBe(400);
    expect(dbState.patch).toBeUndefined();
  });

  it("persists the formation-derived distribution budget with dao_verified", async () => {
    const response = await PATCH(
      patchRequest("dao_verified", {
        policySupplyUnits: "520001000000000000000000",
        genesisMintUnits: "1000000000000000000",
      }),
      { params: Promise.resolve({ id: "node-1" }) }
    );

    expect(response.status).toBe(200);
    expect(dbState.patch).toMatchObject({
      status: "dao_formed",
      distributionBudgetTotalCredits: 520_000,
    });
  });

  it.each([
    { policySupplyUnits: "520001000000000000000000" },
    { genesisMintUnits: "1000000000000000000" },
  ])("rejects dao_verified unless both policy values are present", async (fields) => {
    const response = await PATCH(patchRequest("dao_verified", fields), {
      params: Promise.resolve({ id: "node-1" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "policySupplyUnits and genesisMintUnits are both required with dao_verified",
    });
    expect(dbState.patch).toBeUndefined();
  });
});
