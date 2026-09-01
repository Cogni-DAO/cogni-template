// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/packages/repo-spec/artifact-bundle`
 * Purpose: Prove exact-set, one-source-SHA, digest-pinned node artifact bundles.
 * Scope: Pure repo-spec bundle assembly and resolution. Does not access files, registries, or deploy state.
 * Invariants: ATOMIC_OR_NOTHING, DIGEST_PINNED, ONE_SOURCE_SHA.
 * Side-effects: none
 * Links: packages/repo-spec/src/artifact-bundle.ts, task.5065
 * @public
 */

import {
  buildNodeArtifactBundle,
  resolveNodeArtifactBundle,
} from "@cogni/repo-spec";
import { buildTestRepoSpec, TEST_NODE_IDS } from "@cogni/repo-spec/testing";
import { describe, expect, it } from "vitest";

const SOURCE_SHA = "a".repeat(40);
const APP_IMAGE = `ghcr.io/example/node@sha256:${"1".repeat(64)}`;
const TRADER_IMAGE = `ghcr.io/example/node-paper-trader@sha256:${"2".repeat(64)}`;

function multiServiceSpec() {
  return buildTestRepoSpec({
    deployment: {
      services: [
        {
          name: "app",
          artifact: { name: "app" },
          port: 3200,
          visibility: "public",
        },
        {
          name: "paper-trader",
          artifact: {
            name: "paper-trader",
            dockerfile: "services/paper-trader/Dockerfile",
          },
          port: 9100,
          visibility: "private",
        },
      ],
    },
  });
}

describe("node artifact bundle", () => {
  it("assembles and resolves the complete service set at one source SHA", () => {
    const spec = multiServiceSpec();
    const bundle = buildNodeArtifactBundle({
      spec,
      sourceSha: SOURCE_SHA,
      repository: "example/node",
      artifacts: [
        { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
        {
          artifact: "paper-trader",
          sourceSha: SOURCE_SHA,
          image: TRADER_IMAGE,
        },
      ],
    });

    const resolved = resolveNodeArtifactBundle(spec, bundle, {
      sourceSha: SOURCE_SHA,
      repository: "example/node",
    });
    expect(resolved).toMatchObject({
      nodeId: TEST_NODE_IDS.default,
      sourceSha: SOURCE_SHA,
      repository: "example/node",
    });
    expect(
      resolved.services.map(({ service, image }) => [service.name, image])
    ).toEqual([
      ["app", APP_IMAGE],
      ["paper-trader", TRADER_IMAGE],
    ]);
  });

  it("builds one artifact once and maps it to multiple services", () => {
    const spec = buildTestRepoSpec({
      deployment: {
        services: [
          {
            name: "app",
            artifact: { name: "app" },
            port: 3200,
            visibility: "public",
          },
          {
            name: "worker",
            artifact: { name: "app" },
            port: 9100,
            visibility: "private",
          },
        ],
      },
    });
    const bundle = buildNodeArtifactBundle({
      spec,
      sourceSha: SOURCE_SHA,
      repository: "example/node",
      artifacts: [{ artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE }],
    });

    expect(bundle.services).toHaveLength(2);
    expect(new Set(bundle.services.map((service) => service.image))).toEqual(
      new Set([APP_IMAGE])
    );
  });

  it("rejects a reused artifact identity mapped to different image digests", () => {
    const spec = buildTestRepoSpec({
      deployment: {
        services: [
          {
            name: "app",
            artifact: { name: "app" },
            port: 3200,
            visibility: "public",
          },
          {
            name: "worker",
            artifact: { name: "app" },
            port: 9100,
            visibility: "private",
          },
        ],
      },
    });

    expect(() =>
      resolveNodeArtifactBundle(
        spec,
        {
          schema_version: 1,
          node_id: TEST_NODE_IDS.default,
          source_sha: SOURCE_SHA,
          repository: "example/node",
          services: [
            {
              service: "app",
              artifact: "app",
              source_sha: SOURCE_SHA,
              image: APP_IMAGE,
            },
            {
              service: "worker",
              artifact: "app",
              source_sha: SOURCE_SHA,
              image: TRADER_IMAGE,
            },
          ],
        },
        { sourceSha: SOURCE_SHA, repository: "example/node" }
      )
    ).toThrow(/One artifact identity must resolve to one image digest/);
  });

  it.each([
    {
      name: "stale source SHA",
      expected: { sourceSha: "b".repeat(40), repository: "example/node" },
      message: /Source SHA mismatch/,
    },
    {
      name: "wrong repository",
      expected: { sourceSha: SOURCE_SHA, repository: "example/other" },
      message: /Repository mismatch/,
    },
  ])("rejects a complete bundle with $name", ({ expected, message }) => {
    const spec = multiServiceSpec();
    const bundle = buildNodeArtifactBundle({
      spec,
      sourceSha: SOURCE_SHA,
      repository: "example/node",
      artifacts: [
        { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
        {
          artifact: "paper-trader",
          sourceSha: SOURCE_SHA,
          image: TRADER_IMAGE,
        },
      ],
    });

    expect(() => resolveNodeArtifactBundle(spec, bundle, expected)).toThrow(
      message
    );
  });

  it("supports the omission default as one app artifact", () => {
    const spec = buildTestRepoSpec();
    const bundle = buildNodeArtifactBundle({
      spec,
      sourceSha: SOURCE_SHA,
      repository: "example/node",
      artifacts: [{ artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE }],
    });
    expect(bundle.services).toEqual([
      {
        service: "app",
        artifact: "app",
        source_sha: SOURCE_SHA,
        image: APP_IMAGE,
      },
    ]);
  });

  it.each([
    {
      name: "missing matrix leg",
      artifacts: [{ artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE }],
      message: /Missing artifact for service paper-trader/,
    },
    {
      name: "undeclared artifact",
      artifacts: [
        { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
        {
          artifact: "paper-trader",
          sourceSha: SOURCE_SHA,
          image: TRADER_IMAGE,
        },
        { artifact: "surprise", sourceSha: SOURCE_SHA, image: APP_IMAGE },
      ],
      message: /Undeclared built artifact/,
    },
    {
      name: "mixed source SHA",
      artifacts: [
        { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
        {
          artifact: "paper-trader",
          sourceSha: "b".repeat(40),
          image: TRADER_IMAGE,
        },
      ],
      message: /Source SHA mismatch/,
    },
    {
      name: "mutable image tag",
      artifacts: [
        {
          artifact: "app",
          sourceSha: SOURCE_SHA,
          image: "ghcr.io/example/node:latest",
        },
        {
          artifact: "paper-trader",
          sourceSha: SOURCE_SHA,
          image: TRADER_IMAGE,
        },
      ],
      message: /Invalid bundle/,
    },
  ])("fails atomically on $name", ({ artifacts, message }) => {
    expect(() =>
      buildNodeArtifactBundle({
        spec: multiServiceSpec(),
        sourceSha: SOURCE_SHA,
        repository: "example/node",
        artifacts,
      })
    ).toThrow(message);
  });
});
