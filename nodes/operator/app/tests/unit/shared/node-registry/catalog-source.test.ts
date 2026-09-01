// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/shared/node-registry/catalog-source`
 * Purpose: Unit tests for node-catalog source resolution (bug.5073).
 * Scope: Pure resolution. Does not exercise the GitHub read or the broker route.
 * Invariants: resolution source is independent of the submodule pin-PR target; unset falls back.
 * Side-effects: none
 * Links: src/shared/node-registry/catalog-source.ts
 * @public
 */

import { describe, expect, it } from "vitest";
import { resolveNodeCatalogSource } from "@/shared/node-registry/catalog-source";

describe("resolveNodeCatalogSource (bug.5073)", () => {
  it("resolves nodes from the real monorepo even when pin PRs target a throwaway org", () => {
    // The exact candidate-a / preview shape that made levelup unresolvable.
    expect(
      resolveNodeCatalogSource({
        NODE_REGISTRY_CATALOG_OWNER: "cogni-dao",
        NODE_REGISTRY_CATALOG_REPO: "cogni",
        NODE_SUBMODULE_PARENT_OWNER: "cogni-test-org",
        NODE_SUBMODULE_PARENT_REPO: "cogni-monorepo",
      })
    ).toEqual({ owner: "cogni-dao", repo: "cogni" });
  });

  it("falls back to the submodule parent when unset, leaving production unchanged", () => {
    expect(
      resolveNodeCatalogSource({
        NODE_SUBMODULE_PARENT_OWNER: "cogni-dao",
        NODE_SUBMODULE_PARENT_REPO: "cogni",
      })
    ).toEqual({ owner: "cogni-dao", repo: "cogni" });
  });

  it("treats an empty string as unset rather than resolving an empty owner", () => {
    expect(
      resolveNodeCatalogSource({
        NODE_REGISTRY_CATALOG_OWNER: "",
        NODE_REGISTRY_CATALOG_REPO: "",
        NODE_SUBMODULE_PARENT_OWNER: "cogni-dao",
        NODE_SUBMODULE_PARENT_REPO: "cogni",
      })
    ).toEqual({ owner: "cogni-dao", repo: "cogni" });
  });

  it("returns null when neither pair is configured, so callers stay fail-closed", () => {
    expect(resolveNodeCatalogSource({})).toBeNull();
    expect(
      resolveNodeCatalogSource({ NODE_SUBMODULE_PARENT_OWNER: "cogni-dao" })
    ).toBeNull();
  });

  it("fails closed on a partial override instead of mixing it with the fallback pair", () => {
    expect(
      resolveNodeCatalogSource({
        NODE_REGISTRY_CATALOG_OWNER: "cogni-dao",
        NODE_SUBMODULE_PARENT_OWNER: "cogni-test-org",
        NODE_SUBMODULE_PARENT_REPO: "cogni-monorepo",
      })
    ).toBeNull();
    expect(
      resolveNodeCatalogSource({
        NODE_REGISTRY_CATALOG_REPO: "cogni",
        NODE_SUBMODULE_PARENT_OWNER: "cogni-test-org",
        NODE_SUBMODULE_PARENT_REPO: "cogni-monorepo",
      })
    ).toBeNull();
  });
});
