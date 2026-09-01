// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { readFile } from "node:fs/promises";

import type {
  CoordinationV1Api,
  CoreV1Api,
  CustomObjectsApi,
  V1Lease,
} from "@kubernetes/client-node";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import type { ComputeWorkload } from "@/ports/compute-workload.types";

import {
  KubernetesComputeWorkloadStateAdapter,
  KubernetesLeaseLeaderElector,
} from "./kubernetes-compute-workload.adapter";

function apiError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
}

function declaredWorkload(): ComputeWorkload {
  const digest = `sha256:${"b".repeat(64)}`;
  return {
    apiVersion: "compute.cogni.io/v1alpha1",
    kind: "ComputeWorkload",
    metadata: {
      name: "poly",
      namespace: "cogni-candidate-a",
      uid: "123e4567-e89b-12d3-a456-426614174000",
      generation: 1,
    },
    spec: {
      nodeId: "123e4567-e89b-12d3-a456-426614174001",
      environment: "candidate-a",
      sourceSha: "a".repeat(40),
      artifactDigests: { app: digest },
      workload: {
        name: "poly",
        services: [
          {
            name: "app",
            image: `ghcr.io/cogni-dao/poly@${digest}`,
            command: ["node"],
            args: ["server.mjs"],
            env: { PAPER_TRADER_URL: "http://paper-trader:9100" },
            cpuUnits: 0.5,
            memoryMi: 512,
            storageMi: 1024,
          },
        ],
      },
    },
  };
}

describe("ComputeWorkload Kubernetes contract", () => {
  it("admits generic env/args fields and preserves service bindings over the API wire", async () => {
    const crd = parse(
      await readFile(
        "../../../infra/k8s/platform/compute-workload/crd.yaml",
        "utf8"
      )
    ) as {
      spec: {
        versions: {
          schema: { openAPIV3Schema: Record<string, unknown> };
        }[];
      };
    };
    const schema = crd.spec.versions[0]?.schema.openAPIV3Schema as {
      properties: {
        spec: {
          properties: {
            workload: {
              properties: {
                services: {
                  maxItems: number;
                  items: { properties: Record<string, unknown> };
                };
              };
            };
          };
        };
      };
    };
    const services =
      schema.properties.spec.properties.workload.properties.services;
    expect(services.maxItems).toBe(8);
    expect(services.items.properties).toHaveProperty("env");
    expect(services.items.properties).toHaveProperty("args");

    const resource = declaredWorkload();
    const custom = {
      listNamespacedCustomObject: vi.fn(async () => ({
        body: JSON.parse(JSON.stringify({ items: [resource] })),
      })),
    } as unknown as CustomObjectsApi;
    const state = new KubernetesComputeWorkloadStateAdapter(
      custom,
      {} as CoreV1Api,
      "cogni-candidate-a",
      "test-controller"
    );

    const [roundTripped] = await state.list();
    expect(roundTripped?.spec.workload.services[0]).toMatchObject({
      args: ["server.mjs"],
      env: { PAPER_TRADER_URL: "http://paper-trader:9100" },
    });
  });
});

describe("KubernetesLeaseLeaderElector", () => {
  it("creates the lease when absent and renews without blocking reconciles", async () => {
    const createNamespacedLease = vi.fn(async () => ({ body: {} }));
    const api = {
      readNamespacedLease: vi.fn(async () => {
        throw apiError(404);
      }),
      createNamespacedLease,
    } as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-candidate-a",
      "compute-workload-controller",
      "pod-a"
    );

    await expect(elector.acquireOrRenew()).resolves.toBe(true);
    expect(elector.isLeader()).toBe(true);
    expect(createNamespacedLease).toHaveBeenCalledWith(
      "cogni-candidate-a",
      expect.objectContaining({
        spec: expect.objectContaining({ holderIdentity: "pod-a" }),
      })
    );
  });

  it("refuses an unexpired lease held by another replica", async () => {
    const existing: V1Lease = {
      metadata: { resourceVersion: "7" },
      spec: {
        holderIdentity: "pod-b",
        renewTime: new Date("2026-09-01T12:00:00.000Z"),
        leaseDurationSeconds: 30,
      },
    };
    const replaceNamespacedLease = vi.fn();
    const api = {
      readNamespacedLease: vi.fn(async () => ({ body: existing })),
      replaceNamespacedLease,
    } as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-candidate-a",
      "compute-workload-controller",
      "pod-a"
    );

    await expect(
      elector.acquireOrRenew(new Date("2026-09-01T12:00:10.000Z"))
    ).resolves.toBe(false);
    expect(replaceNamespacedLease).not.toHaveBeenCalled();
  });

  it("takes over only after the prior holder's lease expires", async () => {
    const existing: V1Lease = {
      metadata: { resourceVersion: "7" },
      spec: {
        holderIdentity: "pod-b",
        renewTime: new Date("2026-09-01T12:00:00.000Z"),
        leaseDurationSeconds: 30,
        leaseTransitions: 2,
      },
    };
    const replaceNamespacedLease = vi.fn(async () => ({ body: {} }));
    const api = {
      readNamespacedLease: vi.fn(async () => ({ body: existing })),
      replaceNamespacedLease,
    } as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-candidate-a",
      "compute-workload-controller",
      "pod-a"
    );

    await expect(
      elector.acquireOrRenew(new Date("2026-09-01T12:00:31.000Z"))
    ).resolves.toBe(true);
    expect(replaceNamespacedLease).toHaveBeenCalledWith(
      "compute-workload-controller",
      "cogni-candidate-a",
      expect.objectContaining({
        metadata: expect.objectContaining({ resourceVersion: "7" }),
        spec: expect.objectContaining({
          holderIdentity: "pod-a",
          leaseTransitions: 3,
        }),
      })
    );
  });
});
