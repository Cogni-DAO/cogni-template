// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/features/nodes/attribution-profile-resolver`
 * Purpose: Pin catalog/profile joint authority and fail-closed GitHub attribution routing.
 * Scope: Pure resolver tests with injected catalog/spec readers and clock; no network or database.
 * Invariants: CATALOG_AND_PROFILE_JOINT_AUTHORITY, UNIQUE_ROUTE_OR_NO_WRITE, NODE_IDENTITY_MATCHES.
 * Side-effects: none
 * Links: src/features/nodes/attribution-profile-resolver.ts, bug.5052
 * @public
 */

import { TEST_SCOPE_ID } from "@cogni/repo-spec/testing";
import { describe, expect, it, vi } from "vitest";

import {
  type AttributionProfileResolverDeps,
  type AttributionRoutingNode,
  createAttributionProfileResolver,
  selectLocalAttributionNodes,
} from "@/features/nodes/attribution-profile-resolver";

const PARENT_OWNER = "cogni-test-org";
const PARENT_REPO = "cogni-monorepo";
const NODE_A = "00000000-0000-4000-8000-000000000001";
const NODE_B = "00000000-0000-4000-8000-000000000002";

function specWithRefs(nodeId: string, refs: string[]): string {
  return [
    `node_id: ${nodeId}`,
    `scope_id: ${TEST_SCOPE_ID}`,
    "scope_key: test-key",
    "governance:",
    "  chain_id: '8453'",
    "activity_ledger:",
    "  epoch_length_days: 7",
    "  approvers: []",
    "  activity_sources:",
    "    github:",
    "      attribution_pipeline: github",
    "      source_refs:",
    ...refs.map((ref) => `        - ${ref}`),
  ].join("\n");
}

interface FakeDepsOverrides {
  nodes?: AttributionRoutingNode[];
  specs?: Record<string, string | null>;
  listRoutingNodes?: () => Promise<readonly AttributionRoutingNode[]>;
  fetchRepoSpecText?: AttributionProfileResolverDeps["fetchRepoSpecText"];
  now?: () => number;
  ttlMs?: number;
}

const silentLog = {
  warn: () => {},
  info: () => {},
  error: () => {},
  child: () => silentLog,
  // biome-ignore lint/suspicious/noExplicitAny: minimal pino stub for tests
} as any;

function makeNode(
  id: string,
  slug: string,
  owner = "cogni-test-org",
  repo = slug
): AttributionRoutingNode {
  return { id, slug, repo: { owner, repo } };
}

function makeDeps(o: FakeDepsOverrides): AttributionProfileResolverDeps {
  const specs = o.specs ?? {};
  return {
    listRoutingNodes: o.listRoutingNodes ?? (async () => o.nodes ?? []),
    fetchRepoSpecText:
      o.fetchRepoSpecText ??
      (async ({ owner, repo }) => specs[`${owner}/${repo}`] ?? null),
    parentOwner: PARENT_OWNER,
    parentRepo: PARENT_REPO,
    now: o.now,
    ttlMs: o.ttlMs,
    log: silentLog,
  };
}

describe("selectLocalAttributionNodes", () => {
  it("projects a fresh merged catalog node only into its local activity authority", () => {
    const definitions = [
      {
        nodeId: NODE_A,
        slug: "fresh-node",
        repoOwner: "cogni-test-org",
        repoName: "fresh-node",
        deployEnvs: ["candidate-a", "preview"],
        activityEnv: "candidate-a",
      },
      {
        nodeId: NODE_B,
        slug: "preview-node",
        repoOwner: "cogni-test-org",
        repoName: "preview-node",
        deployEnvs: ["preview"],
        activityEnv: "preview",
      },
    ];

    expect(selectLocalAttributionNodes(definitions, "candidate-a")).toEqual([
      makeNode(NODE_A, "fresh-node"),
    ]);
    expect(selectLocalAttributionNodes(definitions, "production")).toEqual([]);
  });
});

describe("createAttributionProfileResolver", () => {
  it("routes a declared repository to its unique cataloged node", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "fresh-node")],
        specs: {
          "cogni-test-org/fresh-node": specWithRefs(NODE_A, [
            "Cogni-Test-Org/Fresh-Node",
          ]),
        },
      })
    );

    await expect(
      resolver.resolveRepoRoute("cogni-test-org/fresh-node")
    ).resolves.toMatchObject({
      status: "matched",
      repo: "cogni-test-org/fresh-node",
      target: { id: NODE_A, slug: "fresh-node" },
    });
  });

  it("returns unclaimed for an unknown repository instead of an operator fallback", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "fresh-node")],
        specs: {
          "cogni-test-org/fresh-node": specWithRefs(NODE_A, [
            "cogni-test-org/fresh-node",
          ]),
        },
      })
    );

    await expect(
      resolver.resolveRepoRoute("cogni-test-org/unknown")
    ).resolves.toEqual({
      status: "unclaimed",
      repo: "cogni-test-org/unknown",
    });
  });

  it("fails closed when two nodes claim the same repository", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "blue"), makeNode(NODE_B, "green")],
        specs: {
          "cogni-test-org/blue": specWithRefs(NODE_A, ["shared/repo"]),
          "cogni-test-org/green": specWithRefs(NODE_B, ["SHARED/REPO"]),
        },
      })
    );

    await expect(resolver.resolveRepoRoute("shared/repo")).resolves.toEqual({
      status: "ambiguous",
      repo: "shared/repo",
      nodeIds: [NODE_A, NODE_B],
    });
  });

  it("names a catalog repo whose repo-spec does not declare itself", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "fresh-node")],
        specs: {
          "cogni-test-org/fresh-node": specWithRefs(NODE_A, ["other/repo"]),
        },
      })
    );

    await expect(
      resolver.resolveRepoRoute("cogni-test-org/fresh-node")
    ).resolves.toEqual({
      status: "profile_unavailable",
      repo: "cogni-test-org/fresh-node",
      issue: {
        nodeId: NODE_A,
        slug: "fresh-node",
        reason: "catalog_repo_undeclared",
      },
    });
  });

  it("does not let another node claim a catalog repo whose own profile is unavailable", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "fresh-node"), makeNode(NODE_B, "other-node")],
        specs: {
          "cogni-test-org/fresh-node": specWithRefs(NODE_A, ["other/repo"]),
          "cogni-test-org/other-node": specWithRefs(NODE_B, [
            "cogni-test-org/fresh-node",
            "cogni-test-org/other-node",
          ]),
        },
      })
    );

    await expect(
      resolver.resolveRepoRoute("cogni-test-org/fresh-node")
    ).resolves.toMatchObject({
      status: "profile_unavailable",
      issue: { nodeId: NODE_A, reason: "catalog_repo_undeclared" },
    });
  });

  it("fails closed when the catalog and repo-spec node identities differ", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "fresh-node")],
        specs: {
          "cogni-test-org/fresh-node": specWithRefs(NODE_B, [
            "cogni-test-org/fresh-node",
          ]),
        },
      })
    );

    await expect(
      resolver.resolveRepoRoute("cogni-test-org/fresh-node")
    ).resolves.toMatchObject({
      status: "profile_unavailable",
      issue: { reason: "node_id_mismatch" },
    });
  });

  it("reports a cold catalog read failure as index_unavailable", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        listRoutingNodes: async () => {
          throw new Error("github unavailable");
        },
      })
    );

    await expect(resolver.resolveRepoRoute("owner/repo")).resolves.toEqual({
      status: "index_unavailable",
      repo: "owner/repo",
    });
  });

  it("fails closed instead of serving a stale owner when catalog refresh fails", async () => {
    let clock = 1_000;
    let calls = 0;
    const resolver = createAttributionProfileResolver(
      makeDeps({
        listRoutingNodes: async () => {
          calls += 1;
          if (calls > 1) throw new Error("catalog unavailable");
          return [makeNode(NODE_A, "fresh-node")];
        },
        specs: {
          "cogni-test-org/fresh-node": specWithRefs(NODE_A, [
            "cogni-test-org/fresh-node",
          ]),
        },
        now: () => clock,
        ttlMs: 10_000,
      })
    );

    await expect(
      resolver.resolveRepoRoute("cogni-test-org/fresh-node")
    ).resolves.toMatchObject({ status: "matched" });
    clock += 10_001;
    await expect(
      resolver.resolveRepoRoute("cogni-test-org/fresh-node")
    ).resolves.toEqual({
      status: "index_unavailable",
      repo: "cogni-test-org/fresh-node",
    });
  });

  it("distinguishes an unreadable child repo-spec from a missing one", async () => {
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "fresh-node")],
        fetchRepoSpecText: async () => {
          throw new Error("GitHub App installation cannot read child");
        },
      })
    );

    await expect(
      resolver.resolveRepoRoute("cogni-test-org/fresh-node")
    ).resolves.toMatchObject({
      status: "profile_unavailable",
      issue: { reason: "repo_spec_read_failed" },
    });
  });

  it("uses the in-repo repo-spec path discriminator for the parent node", async () => {
    const fetchRepoSpecText = vi.fn(async (input) => {
      expect(input).toMatchObject({
        owner: PARENT_OWNER,
        repo: PARENT_REPO,
        slug: "operator",
        isInRepo: true,
      });
      return specWithRefs(NODE_A, [`${PARENT_OWNER}/${PARENT_REPO}`]);
    });
    const resolver = createAttributionProfileResolver(
      makeDeps({
        nodes: [makeNode(NODE_A, "operator", PARENT_OWNER, PARENT_REPO)],
        fetchRepoSpecText,
      })
    );

    await expect(
      resolver.resolveRepoRoute(`${PARENT_OWNER}/${PARENT_REPO}`)
    ).resolves.toMatchObject({ status: "matched" });
    expect(fetchRepoSpecText).toHaveBeenCalledTimes(1);
  });

  it("single-flights and caches catalog/profile reads within the bounded TTL", async () => {
    let clock = 1_000;
    const listRoutingNodes = vi.fn(async () => [
      makeNode(NODE_A, "fresh-node"),
    ]);
    const resolver = createAttributionProfileResolver(
      makeDeps({
        listRoutingNodes,
        fetchRepoSpecText: async () =>
          specWithRefs(NODE_A, ["cogni-test-org/fresh-node"]),
        now: () => clock,
        ttlMs: 10_000,
      })
    );

    await Promise.all([
      resolver.resolveRepoRoute("cogni-test-org/fresh-node"),
      resolver.resolveRepoRoute("COGNI-TEST-ORG/FRESH-NODE"),
    ]);
    expect(listRoutingNodes).toHaveBeenCalledTimes(1);

    clock += 10_001;
    await resolver.resolveRepoRoute("cogni-test-org/fresh-node");
    expect(listRoutingNodes).toHaveBeenCalledTimes(2);
  });
});
