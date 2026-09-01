// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { parseRepoSpec, resolveNodeArtifactBundle } from "@cogni/repo-spec";
import { describe, expect, it } from "vitest";

import { buildNodeServicesWorkloadSpec } from "./node-services-workload-spec";

const NODE_ID = "00000000-0000-4000-8000-000000000001";
const SOURCE_SHA = "a".repeat(40);
const APP_IMAGE = `ghcr.io/example/poly@sha256:${"1".repeat(64)}`;
const TRADER_IMAGE = `ghcr.io/example/poly-paper-trader@sha256:${"2".repeat(64)}`;

const spec = parseRepoSpec({
  node_id: NODE_ID,
  governance: {},
  deployment: {
    services: [
      {
        name: "app",
        artifact: { name: "app" },
        port: 3200,
        visibility: "public",
        bindings: { PAPER_TRADER_URL: "paper-trader" },
      },
      {
        name: "paper-trader",
        artifact: {
          name: "paper-trader",
          dockerfile: "services/paper-trader/Dockerfile",
        },
        command: ["python", "-m", "paper_trader"],
        args: ["--host", "0.0.0.0", "--port", "9100"],
        port: 9100,
        visibility: "private",
        resources: { cpu_units: 0.25, memory_mi: 512, storage_mi: 1024 },
      },
    ],
  },
});

const bundle = resolveNodeArtifactBundle(spec, {
  schema_version: 1,
  node_id: NODE_ID,
  source_sha: SOURCE_SHA,
  repository: "example/poly",
  services: [
    {
      service: "app",
      artifact: "app",
      source_sha: SOURCE_SHA,
      image: APP_IMAGE,
    },
    {
      service: "paper-trader",
      artifact: "paper-trader",
      source_sha: SOURCE_SHA,
      image: TRADER_IMAGE,
    },
  ],
});

describe("buildNodeServicesWorkloadSpec", () => {
  it("builds one public app plus one non-global private sibling by digest", () => {
    const workload = buildNodeServicesWorkloadSpec({
      slug: "poly",
      bundle,
      publicUrl: "https://poly-test.cognidao.org",
      hosts: ["poly-test.cognidao.org"],
    });

    expect(workload.services).toHaveLength(2);
    expect(workload.services[0]).toMatchObject({
      name: "app",
      image: APP_IMAGE,
      expose: [
        {
          port: 3200,
          as: 80,
          global: true,
          hosts: ["poly-test.cognidao.org"],
        },
      ],
      env: { PAPER_TRADER_URL: "http://paper-trader:9100" },
    });
    expect(workload.services[1]).toMatchObject({
      name: "paper-trader",
      image: TRADER_IMAGE,
      command: ["python", "-m", "paper_trader"],
      args: ["--host", "0.0.0.0", "--port", "9100"],
      expose: [{ port: 9100, as: 9100, global: false }],
    });
  });

  it("pins bind env after service env and exposes the service-name URL contract", () => {
    const workload = buildNodeServicesWorkloadSpec({
      slug: "poly",
      bundle,
      publicUrl: "https://poly-test.cognidao.org",
      envByService: {
        "paper-trader": {
          HOST: "127.0.0.1",
          HOSTNAME: "localhost",
          PORT: "1",
        },
      },
    });

    const trader = workload.services[1];
    expect(trader?.env).toMatchObject({
      HOST: "0.0.0.0",
      HOSTNAME: "0.0.0.0",
      PORT: "9100",
    });
    expect(bundle.services[1]?.service.internalUrl).toBe(
      "http://paper-trader:9100"
    );
  });

  it("rejects runtime env that tries to override Git-declared topology", () => {
    expect(() =>
      buildNodeServicesWorkloadSpec({
        slug: "poly",
        bundle,
        publicUrl: "https://poly-test.cognidao.org",
        envByService: {
          app: { PAPER_TRADER_URL: "https://foreign.example" },
        },
      })
    ).toThrow(/cannot override Git-declared binding/);
  });
});
