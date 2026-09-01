// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/unit/packages/repo-spec/node-deployment`
 * Purpose: Prove the provider-neutral node services and sibling binding declaration.
 * Scope: Pure repo-spec parsing and typed extraction. Does not perform deployment or provider I/O.
 * Invariants: LEGACY_DEFAULT, ONE_PUBLIC_SERVICE, APP_ONLY, BIND_ALL_INTERFACES.
 * Side-effects: none
 * Links: packages/repo-spec/src/schema.ts, task.5065
 * @public
 */

import { extractNodeServices, parseRepoSpec } from "@cogni/repo-spec";
import { buildTestRepoSpec } from "@cogni/repo-spec/testing";
import { describe, expect, it } from "vitest";

const APP = {
  name: "app",
  artifact: { name: "app" },
  port: 3200,
  visibility: "public",
  resources: { cpu_units: 1, memory_mi: 2048, storage_mi: 4096 },
} as const;

describe("node deployment repo-spec", () => {
  it("preserves the real node-template behavior when deployment is omitted", () => {
    expect(extractNodeServices(buildTestRepoSpec())).toEqual([
      {
        name: "app",
        artifact: {
          name: "app",
          context: ".",
          dockerfile: "Dockerfile",
          target: "runner",
        },
        port: 3200,
        visibility: "public",
        bindings: {},
        secretRefs: [],
        bindHost: "0.0.0.0",
        internalUrl: "http://app:3200",
        resources: {
          cpuUnits: 2,
          memoryMi: 2048,
          storageMi: 4096,
        },
      },
    ]);
  });

  it("declares one public app and a private service without provider vocabulary", () => {
    const spec = buildTestRepoSpec({
      deployment: {
        services: [
          APP,
          {
            name: "paper-trader",
            artifact: {
              name: "paper-trader",
              context: "services/paper-trader",
              dockerfile: "services/paper-trader/Dockerfile",
            },
            command: ["python", "-m", "paper_trader"],
            args: ["--host", "0.0.0.0", "--port", "9100"],
            port: 9100,
            visibility: "private",
            resources: {
              cpu_units: 2,
              memory_mi: 16384,
              storage_mi: 65536,
            },
          },
        ],
      },
    });

    expect(extractNodeServices(spec)[1]).toEqual({
      name: "paper-trader",
      artifact: {
        name: "paper-trader",
        context: "services/paper-trader",
        dockerfile: "services/paper-trader/Dockerfile",
      },
      command: ["python", "-m", "paper_trader"],
      args: ["--host", "0.0.0.0", "--port", "9100"],
      port: 9100,
      visibility: "private",
      bindings: {},
      secretRefs: [],
      bindHost: "0.0.0.0",
      internalUrl: "http://paper-trader:9100",
      resources: { cpuUnits: 2, memoryMi: 16384, storageMi: 65536 },
    });
  });

  it("allows services to reuse one artifact image", () => {
    const spec = buildTestRepoSpec({
      deployment: {
        services: [
          APP,
          {
            name: "worker",
            artifact: { name: "app" },
            command: ["node"],
            args: ["worker.mjs"],
            port: 9100,
            visibility: "private",
            resources: {
              cpu_units: 0.5,
              memory_mi: 1024,
              storage_mi: 2048,
            },
          },
        ],
      },
    });

    expect(
      extractNodeServices(spec).map((service) => service.artifact.name)
    ).toEqual(["app", "app"]);
  });

  it("rejects conflicting build instructions for a reused artifact identity", () => {
    expect(() =>
      buildTestRepoSpec({
        deployment: {
          services: [
            APP,
            {
              name: "worker",
              artifact: { name: "app", dockerfile: "Worker.Dockerfile" },
              port: 9100,
              visibility: "private",
              resources: {
                cpu_units: 0.5,
                memory_mi: 1024,
                storage_mi: 2048,
              },
            },
          ],
        },
      })
    ).toThrow(/identical build instructions/);
  });

  it("resolves a bounded Git-declared binding to the sibling service contract", () => {
    const spec = buildTestRepoSpec({
      deployment: {
        services: [
          { ...APP, bindings: { PAPER_TRADER_URL: "paper-trader" } },
          {
            name: "paper-trader",
            artifact: { name: "paper-trader" },
            port: 9100,
            visibility: "private",
            resources: {
              cpu_units: 0.5,
              memory_mi: 1024,
              storage_mi: 2048,
            },
          },
        ],
      },
    });

    expect(extractNodeServices(spec)[0]?.bindings).toEqual({
      PAPER_TRADER_URL: "paper-trader",
    });
    expect(extractNodeServices(spec)[1]?.internalUrl).toBe(
      "http://paper-trader:9100"
    );
  });

  it("carries bounded value-free secret requirements", () => {
    const spec = buildTestRepoSpec({
      deployment: {
        services: [
          { ...APP, secret_refs: [{ key: "APP_TOKEN" }] },
          {
            name: "worker",
            artifact: { name: "worker" },
            port: 9100,
            visibility: "private",
            resources: {
              cpu_units: 0.5,
              memory_mi: 1024,
              storage_mi: 2048,
            },
          },
        ],
      },
    });
    expect(extractNodeServices(spec)[0]?.secretRefs).toEqual([
      { key: "APP_TOKEN" },
    ]);
  });

  it.each([
    {
      name: "no public service",
      services: [{ ...APP, visibility: "private" }],
      message: /exactly one public service/,
    },
    {
      name: "two public services",
      services: [APP, { ...APP, name: "other" }],
      message: /exactly one public service/,
    },
    {
      name: "loopback bind",
      services: [{ ...APP, bind_host: "127.0.0.1" }],
      message: /Invalid repo-spec structure/,
    },
    {
      name: "missing binding target",
      services: [{ ...APP, bindings: { PAPER_TRADER_URL: "paper-trader" } }],
      message: /binding target is not declared/,
    },
    {
      name: "secret value in Git",
      services: [
        { ...APP, secret_refs: [{ key: "APP_TOKEN", value: "forbidden" }] },
      ],
      message: /Invalid repo-spec structure/,
    },
    {
      name: "binding and secret collision",
      services: [
        {
          ...APP,
          bindings: { APP_TOKEN: "worker" },
          secret_refs: [{ key: "APP_TOKEN" }],
        },
        { ...APP, name: "worker", visibility: "private" },
      ],
      message: /cannot be both a sibling binding and a secret ref/,
    },
  ])("rejects $name", ({ services, message }) => {
    expect(() =>
      parseRepoSpec({
        node_id: "00000000-0000-4000-8000-000000000001",
        governance: {},
        deployment: { services },
      })
    ).toThrow(message);
  });

  it("rejects implicit sizing for an explicitly declared service", () => {
    const { resources: _resources, ...appWithoutResources } = APP;
    expect(() =>
      parseRepoSpec({
        node_id: "00000000-0000-4000-8000-000000000001",
        governance: {},
        deployment: { services: [appWithoutResources] },
      })
    ).toThrow(/Invalid repo-spec structure/);
  });

  it("rejects partial explicit sizing", () => {
    expect(() =>
      parseRepoSpec({
        node_id: "00000000-0000-4000-8000-000000000001",
        governance: {},
        deployment: {
          services: [{ ...APP, resources: { cpu_units: 2 } }],
        },
      })
    ).toThrow(/Invalid repo-spec structure/);
  });

  it("does not infer statefulness from a generic service name", () => {
    expect(() =>
      parseRepoSpec({
        node_id: "00000000-0000-4000-8000-000000000001",
        governance: {},
        deployment: {
          services: [APP, { ...APP, name: "redis", visibility: "private" }],
        },
      })
    ).not.toThrow();
  });

  it("rejects unsupported persistent-state fields structurally", () => {
    expect(() =>
      parseRepoSpec({
        node_id: "00000000-0000-4000-8000-000000000001",
        governance: {},
        deployment: {
          services: [
            {
              ...APP,
              persistent_volume: { size_mi: 1024 },
            },
          ],
        },
      })
    ).toThrow(/Invalid repo-spec structure/);
  });
});
