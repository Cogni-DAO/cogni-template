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
const WORKER_IMAGE = `ghcr.io/example/node-worker@sha256:${"2".repeat(64)}`;

function multiServiceSpec() {
  return buildTestRepoSpec({
    deployment: {
      services: [
        {
          name: "app",
          artifact: { name: "app" },
          port: 3200,
          visibility: "public",
          resources: { cpu_units: 1, memory_mi: 2048, storage_mi: 4096 },
        },
        {
          name: "worker",
          artifact: {
            name: "worker",
            dockerfile: "services/worker/Dockerfile",
          },
          port: 9100,
          visibility: "private",
          resources: { cpu_units: 0.5, memory_mi: 1024, storage_mi: 2048 },
        },
      ],
    },
  });
}

function completeBundle() {
  return buildNodeArtifactBundle({
    spec: multiServiceSpec(),
    sourceSha: SOURCE_SHA,
    repository: "example/node",
    artifacts: [
      { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
      { artifact: "worker", sourceSha: SOURCE_SHA, image: WORKER_IMAGE },
    ],
  });
}

describe("node artifact bundle", () => {
  it("emits one source identity, artifact digest authority, and service refs", () => {
    const bundle = completeBundle();

    expect(bundle).toEqual({
      schema_version: 1,
      node_id: TEST_NODE_IDS.default,
      source: { repository: "example/node", sha: SOURCE_SHA },
      artifacts: [
        { name: "app", image: APP_IMAGE },
        { name: "worker", image: WORKER_IMAGE },
      ],
      services: [
        { name: "app", artifact: "app" },
        { name: "worker", artifact: "worker" },
      ],
    });

    const resolved = resolveNodeArtifactBundle(multiServiceSpec(), bundle, {
      sourceSha: SOURCE_SHA,
      repository: "example/node",
    });
    expect(resolved).toMatchObject({
      nodeId: TEST_NODE_IDS.default,
      source: { repository: "example/node", sha: SOURCE_SHA },
      artifacts: bundle.artifacts,
    });
    expect(
      resolved.services.map(({ service, artifact, image }) => [
        service.name,
        artifact,
        image,
      ])
    ).toEqual([
      ["app", "app", APP_IMAGE],
      ["worker", "worker", WORKER_IMAGE],
    ]);
    expect(resolved.services[0]?.service.secretRefs).toEqual([]);
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
            resources: { cpu_units: 1, memory_mi: 2048, storage_mi: 4096 },
          },
          {
            name: "worker",
            artifact: { name: "app" },
            port: 9100,
            visibility: "private",
            resources: { cpu_units: 0.5, memory_mi: 1024, storage_mi: 2048 },
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

    expect(bundle.artifacts).toEqual([{ name: "app", image: APP_IMAGE }]);
    expect(bundle.services).toEqual([
      { name: "app", artifact: "app" },
      { name: "worker", artifact: "app" },
    ]);
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
    expect(() =>
      resolveNodeArtifactBundle(multiServiceSpec(), completeBundle(), expected)
    ).toThrow(message);
  });

  it("supports the omission default as one app artifact", () => {
    const spec = buildTestRepoSpec();
    const bundle = buildNodeArtifactBundle({
      spec,
      sourceSha: SOURCE_SHA,
      repository: "example/node",
      artifacts: [{ artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE }],
    });
    expect(bundle).toMatchObject({
      source: { repository: "example/node", sha: SOURCE_SHA },
      artifacts: [{ name: "app", image: APP_IMAGE }],
      services: [{ name: "app", artifact: "app" }],
    });
  });

  it("canonicalizes GitHub repository identity case", () => {
    const bundle = buildNodeArtifactBundle({
      spec: multiServiceSpec(),
      sourceSha: SOURCE_SHA,
      repository: "Example/Node",
      artifacts: [
        { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
        { artifact: "worker", sourceSha: SOURCE_SHA, image: WORKER_IMAGE },
      ],
    });
    expect(bundle.source.repository).toBe("example/node");
    expect(() =>
      resolveNodeArtifactBundle(multiServiceSpec(), bundle, {
        sourceSha: SOURCE_SHA,
        repository: "EXAMPLE/NODE",
      })
    ).not.toThrow();
  });

  it.each([
    {
      name: "missing matrix leg",
      artifacts: [{ artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE }],
      message: /Missing artifact for service worker/,
    },
    {
      name: "undeclared artifact",
      artifacts: [
        { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
        { artifact: "worker", sourceSha: SOURCE_SHA, image: WORKER_IMAGE },
        { artifact: "surprise", sourceSha: SOURCE_SHA, image: APP_IMAGE },
      ],
      message: /Undeclared built artifact/,
    },
    {
      name: "mixed source SHA",
      artifacts: [
        { artifact: "app", sourceSha: SOURCE_SHA, image: APP_IMAGE },
        {
          artifact: "worker",
          sourceSha: "b".repeat(40),
          image: WORKER_IMAGE,
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
        { artifact: "worker", sourceSha: SOURCE_SHA, image: WORKER_IMAGE },
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

  it("rejects dangling service artifact refs before resolution", () => {
    const bundle = completeBundle();
    expect(() =>
      resolveNodeArtifactBundle(
        multiServiceSpec(),
        {
          ...bundle,
          services: [
            bundle.services[0],
            { name: "worker", artifact: "missing" },
          ],
        },
        { sourceSha: SOURCE_SHA, repository: "example/node" }
      )
    ).toThrow(/Service references missing artifact/);
  });
});
