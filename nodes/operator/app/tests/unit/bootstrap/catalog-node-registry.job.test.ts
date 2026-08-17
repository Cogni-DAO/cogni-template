// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/bootstrap/catalog-node-registry.job`
 * Purpose: Verify catalog ownership projects to the node model's real OpenFGA admin role.
 * Scope: Pure authorization-port orchestration; no GitHub, database, or OpenFGA IO.
 * Invariants: CATALOG_OWNER_IS_NODE_ADMIN, AUTHZ_FAILURE_IS_LOUD.
 * Side-effects: none
 * Links: src/bootstrap/jobs/reconcileCatalogNodeRegistry.job.ts, infra/openfga/rbac-model.json
 * @internal
 */

import type { AuthorizationPort } from "@cogni/authorization-core";
import { describe, expect, it, vi } from "vitest";

import { ensureCatalogNodeOwnerRelations } from "@/bootstrap/jobs/reconcileCatalogNodeRegistry.job";

describe("ensureCatalogNodeOwnerRelations", () => {
  it("writes the node#admin ownership tuple using the env-local user id", async () => {
    const writeRelation = vi.fn().mockResolvedValue({
      decision: "success",
      code: "authz_write_success",
    });
    const authorization = { writeRelation } as unknown as AuthorizationPort;

    await expect(
      ensureCatalogNodeOwnerRelations(authorization, [
        {
          nodeId: "11111111-1111-4111-8111-111111111111",
          ownerUserId: "env-local-user",
        },
      ])
    ).resolves.toBe(1);
    expect(writeRelation).toHaveBeenCalledWith({
      user: "user:env-local-user",
      relation: "admin",
      object: "node:11111111-1111-4111-8111-111111111111",
    });
  });

  it("fails loud when ownership cannot be written", async () => {
    const authorization = {
      writeRelation: vi.fn().mockResolvedValue({
        decision: "failure",
        code: "authz_write_unavailable",
        reason: "store unavailable",
      }),
    } as unknown as AuthorizationPort;

    await expect(
      ensureCatalogNodeOwnerRelations(authorization, [
        {
          nodeId: "11111111-1111-4111-8111-111111111111",
          ownerUserId: "env-local-user",
        },
      ])
    ).rejects.toThrow(/store unavailable/);
  });
});
