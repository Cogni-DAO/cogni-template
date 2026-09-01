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
        bindHost: "0.0.0.0",
        internalUrl: "http://app:3200",
        resources: {
          cpuUnits: 0.5,
          memoryMi: 1024,
          storageMi: 2048,
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
      name: "state infrastructure sidecar",
      services: [APP, { ...APP, name: "redis", visibility: "private" }],
      message: /state infrastructure/,
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
  ])("rejects $name", ({ services, message }) => {
    expect(() =>
      parseRepoSpec({
        node_id: "00000000-0000-4000-8000-000000000001",
        governance: {},
        deployment: { services },
      })
    ).toThrow(message);
  });
});
