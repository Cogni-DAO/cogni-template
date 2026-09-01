// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { readFile } from "node:fs/promises";

import type {
  CoordinationV1Api,
  CoreV1Api,
  CustomObjectsApi,
  V1ConfigMap,
  V1Lease,
} from "@kubernetes/client-node";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import type { ComputeWorkload } from "@/ports/compute-workload.types";

import {
  KubernetesComputeWorkloadStateAdapter,
  KubernetesLeaseLeaderElector,
  renewLeadershipOrFence,
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
      name: "123e4567-e89b-12d3-a456-426614174001",
      namespace: "cogni-candidate-a",
      uid: "123e4567-e89b-12d3-a456-426614174000",
      generation: 1,
      resourceVersion: "1",
      labels: {
        "cogni.io/node-id": "123e4567-e89b-12d3-a456-426614174001",
        "cogni.io/environment": "candidate-a",
      },
    },
    spec: {
      nodeId: "123e4567-e89b-12d3-a456-426614174001",
      environment: "candidate-a",
      bundle: {
        ref: `ghcr.io/cogni-dao/sample-node-bundle@sha256:${"c".repeat(64)}`,
        source: { repository: "cogni-dao/sample-node", sha: "a".repeat(40) },
        artifacts: [
          { name: "app", image: `ghcr.io/cogni-dao/sample-node@${digest}` },
          {
            name: "echo-sidecar",
            image: `ghcr.io/cogni-dao/echo-sidecar@${digest}`,
          },
        ],
      },
      workload: {
        name: "sample-node",
        publicHost: "sample-node-test.cognidao.org",
        services: [
          {
            name: "app",
            artifact: "app",
            command: ["node"],
            args: ["server.mjs"],
            port: 3000,
            visibility: "public",
            bindings: { ECHO_SIDECAR_URL: "echo-sidecar" },
            bindHost: "0.0.0.0",
            cpuUnits: 0.5,
            memoryMi: 512,
            storageMi: 1024,
          },
          {
            name: "echo-sidecar",
            artifact: "echo-sidecar",
            port: 9100,
            visibility: "private",
            bindings: {},
            bindHost: "0.0.0.0",
            cpuUnits: 0.25,
            memoryMi: 256,
            storageMi: 512,
          },
        ],
      },
    },
  };
}

describe("ComputeWorkload Kubernetes contract", () => {
  it("admits bounded topology fields and preserves service bindings over the API wire", async () => {
    const crdYaml = await readFile(
      "../../../infra/k8s/base/compute-workload-platform/crd.yaml",
      "utf8"
    );
    const crd = parse(crdYaml) as {
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
    expect(services.items.properties).toHaveProperty("bindings");
    expect(services.items.properties).toHaveProperty("args");
    expect(crdYaml).toContain(
      "self.services.filter(s, s.visibility == 'public').size() == 1"
    );
    expect(crdYaml).toContain(
      "every binding must target a different declared sibling service"
    );
    expect(crdYaml).toContain(
      "workload name must equal the immutable source repository slug"
    );
    expect(
      (schema.properties.spec.properties as Record<string, unknown>).bundle
    ).toBeDefined();

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
      bindings: { ECHO_SIDECAR_URL: "echo-sidecar" },
    });
  });

  it("claims a provider mutation with metadata.resourceVersion CAS", async () => {
    const patchNamespacedCustomObject = vi.fn(async () => ({ body: {} }));
    const custom = {
      patchNamespacedCustomObject,
    } as unknown as CustomObjectsApi;
    const state = new KubernetesComputeWorkloadStateAdapter(
      custom,
      {} as CoreV1Api,
      "cogni-candidate-a",
      "test-controller"
    );
    await expect(
      state.claimAttempt({
        resource: declaredWorkload(),
        receipt: '{"key":"one"}',
      })
    ).resolves.toBe(true);
    expect(patchNamespacedCustomObject).toHaveBeenCalledWith(
      "compute.cogni.io",
      "v1alpha1",
      "cogni-candidate-a",
      "computeworkloads",
      "123e4567-e89b-12d3-a456-426614174001",
      expect.objectContaining({
        metadata: expect.objectContaining({
          resourceVersion: "1",
          annotations: { "compute.cogni.io/last-attempt": '{"key":"one"}' },
        }),
      }),
      undefined,
      "compute-workload-controller",
      undefined,
      expect.any(Object)
    );

    patchNamespacedCustomObject.mockRejectedValueOnce(apiError(409));
    await expect(
      state.claimAttempt({ resource: declaredWorkload(), receipt: "other" })
    ).resolves.toBe(false);
  });

  it("holds one durable wallet-wide allocation across competing workload reconciles", async () => {
    let ledger = {
      metadata: {
        name: "compute-workload-allocation-ledger",
        namespace: "cogni-candidate-a",
        resourceVersion: "1",
      },
      data: {} as Record<string, string>,
    };
    const core = {
      readNamespacedConfigMap: vi.fn(async () => ({
        body: structuredClone(ledger),
      })),
      replaceNamespacedConfigMap: vi.fn(async (_name, _namespace, body) => {
        ledger = {
          metadata: {
            ...ledger.metadata,
            resourceVersion: String(
              Number(ledger.metadata.resourceVersion) + 1
            ),
          },
          data: { ...(body.data ?? {}) },
        };
        return { body: structuredClone(ledger) };
      }),
    } as unknown as CoreV1Api;
    const state = new KubernetesComputeWorkloadStateAdapter(
      {} as CustomObjectsApi,
      core,
      "cogni-candidate-a",
      "test-controller"
    );

    await expect(
      state.claimWalletAllocation({ attemptKey: "a", workloadUid: "uid-a" })
    ).resolves.toEqual({ state: "claimed" });
    await state.prepareWalletAllocation({
      attemptKey: "a",
      allocationCursor: "41",
    });
    await expect(
      state.claimWalletAllocation({ attemptKey: "a", workloadUid: "uid-a" })
    ).resolves.toEqual({ state: "owned", allocationCursor: "41" });
    await expect(
      state.claimWalletAllocation({ attemptKey: "b", workloadUid: "uid-b" })
    ).resolves.toEqual({ state: "blocked", ownerAttemptKey: "a" });
    await state.completeWalletAllocation({ attemptKey: "a" });
    await expect(
      state.claimWalletAllocation({ attemptKey: "b", workloadUid: "uid-b" })
    ).resolves.toEqual({ state: "claimed" });
  });

  it("creates the runtime ledger outside Argo ownership before first allocation", async () => {
    let ledger:
      | {
          metadata: {
            name: string;
            namespace: string;
            resourceVersion: string;
          };
          data: Record<string, string>;
        }
      | undefined;
    const core = {
      readNamespacedConfigMap: vi.fn(async () => {
        if (!ledger) throw apiError(404);
        return { body: structuredClone(ledger) };
      }),
      createNamespacedConfigMap: vi.fn(
        async (_namespace: string, body: V1ConfigMap) => {
          ledger = {
            metadata: {
              name: body.metadata?.name ?? "",
              namespace: body.metadata?.namespace ?? "",
              resourceVersion: "1",
            },
            data: {},
          };
          return { body: structuredClone(ledger) };
        }
      ),
      replaceNamespacedConfigMap: vi.fn(
        async (_name: string, _namespace: string, body: V1ConfigMap) => {
          ledger = {
            metadata: {
              name: body.metadata?.name ?? "",
              namespace: body.metadata?.namespace ?? "",
              resourceVersion: "2",
            },
            data: { ...(body.data ?? {}) },
          };
          return { body: structuredClone(ledger) };
        }
      ),
    } as unknown as CoreV1Api;
    const state = new KubernetesComputeWorkloadStateAdapter(
      {} as CustomObjectsApi,
      core,
      "cogni-candidate-a",
      "test-controller"
    );

    await expect(
      state.claimWalletAllocation({ attemptKey: "a", workloadUid: "uid-a" })
    ).resolves.toEqual({ state: "claimed" });
    expect(core.createNamespacedConfigMap).toHaveBeenCalledOnce();
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

  it("guards dispatch with the live holder identity and lease-transition epoch", async () => {
    const lease: V1Lease = {
      metadata: { resourceVersion: "9" },
      spec: {
        holderIdentity: "pod-a",
        renewTime: new Date("2026-09-01T12:00:00.000Z"),
        leaseDurationSeconds: 30,
        leaseTransitions: 4,
      },
    };
    const api = {
      readNamespacedLease: vi.fn(async () => ({ body: lease })),
      replaceNamespacedLease: vi.fn(async () => ({ body: lease })),
    } as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-candidate-a",
      "compute-workload-controller",
      "pod-a"
    );
    await elector.acquireOrRenew(new Date("2026-09-01T12:00:05.000Z"));
    expect(elector.currentEpoch()).toBe("4:pod-a");
    await expect(
      elector.stillHolds("4:pod-a", new Date("2026-09-01T12:00:06.000Z"))
    ).resolves.toBe(true);
    await expect(
      elector.stillHolds("3:pod-a", new Date("2026-09-01T12:00:06.000Z"))
    ).resolves.toBe(false);
  });
});

describe("renewLeadershipOrFence", () => {
  it("immediately fences a process that loses its previously-held lease", async () => {
    const fenced = new Error("process fenced");
    const onLeadershipLost = vi.fn((): never => {
      throw fenced;
    });
    const lease = {
      isLeader: () => true,
      acquireOrRenew: vi.fn(async () => false),
    };

    await expect(renewLeadershipOrFence(lease, onLeadershipLost)).rejects.toBe(
      fenced
    );
    expect(onLeadershipLost).toHaveBeenCalledOnce();
    expect(onLeadershipLost).toHaveBeenCalledWith(expect.any(Error));
  });

  it("fences a prior leader when renewal errors but not an ordinary follower", async () => {
    const failure = new Error("API unavailable past lease deadline");
    const fenced = new Error("process fenced");
    const priorLeaderFence = vi.fn((): never => {
      throw fenced;
    });
    await expect(
      renewLeadershipOrFence(
        {
          isLeader: () => true,
          acquireOrRenew: async () => {
            throw failure;
          },
        },
        priorLeaderFence
      )
    ).rejects.toBe(fenced);
    expect(priorLeaderFence).toHaveBeenCalledWith(failure);

    const followerFence = vi.fn((): never => {
      throw new Error("follower must not be fenced");
    });
    await expect(
      renewLeadershipOrFence(
        {
          isLeader: () => false,
          acquireOrRenew: async () => false,
        },
        followerFence
      )
    ).resolves.toBe(false);
    expect(followerFence).not.toHaveBeenCalled();
  });
});
