// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CoordinationV1Api,
  CoreV1Api,
  CustomObjectsApi,
  V1ConfigMap,
  V1Lease,
} from "@kubernetes/client-node";
import { describe, expect, it, vi } from "vitest";
import { parse, parseDocument } from "yaml";

import type { ComputeWorkload } from "@/ports";

import {
  describeKubernetesError,
  KubernetesComputeWorkloadStateAdapter,
  KubernetesLeaseLeaderElector,
  type LeadershipLoss,
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
        "cogni.io/node": "sample-node",
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
            runtimeProfile: "cogni-node-app-v1",
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
    // File-relative, never CWD-relative: the unit job and local runs invoke
    // vitest from different working directories.
    const crdYaml = await readFile(
      join(
        fileURLToPath(new URL(".", import.meta.url)),
        "../../../../../../../infra/k8s/base/compute-workload-platform/crd.yaml"
      ),
      "utf8"
    );
    expect(parseDocument(crdYaml, { uniqueKeys: true }).errors).toEqual([]);
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
    expect(services.items.properties).toHaveProperty("runtimeProfile");
    expect(crdYaml).toContain(
      "self.services.filter(s, s.visibility == 'public').size() == 1"
    );
    expect(crdYaml).toContain(
      "runtimeProfile is allowed only on the public service"
    );
    expect(crdYaml).toContain(
      "every binding must target a different declared sibling service"
    );
    // Label↔spec equality CANNOT be a CRD CEL rule (metadata.labels is
    // outside CRD CEL scope — the API server rejects the whole CRD). The
    // single-writer materializer + the controller's label-then-spec selection
    // own that invariant; only metadata.name is CEL-enforceable.
    expect(crdYaml).toContain(
      "metadata.name must equal spec.nodeId (one paid workload per node/env namespace)"
    );
    expect(crdYaml).not.toContain("self.metadata.labels");
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
      runtimeProfile: "cogni-node-app-v1",
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

  it("deletes a stale failure when status becomes healthy", async () => {
    const patchNamespacedCustomObjectStatus = vi.fn(async () => ({ body: {} }));
    const state = new KubernetesComputeWorkloadStateAdapter(
      { patchNamespacedCustomObjectStatus } as unknown as CustomObjectsApi,
      {} as CoreV1Api,
      "cogni-candidate-a",
      "test-controller"
    );

    await state.patchStatus({
      resource: declaredWorkload(),
      status: {
        phase: "Ready",
        desiredGeneration: 1,
        observedGeneration: 1,
        conditions: [],
      },
    });

    expect(patchNamespacedCustomObjectStatus).toHaveBeenCalledWith(
      "compute.cogni.io",
      "v1alpha1",
      "cogni-candidate-a",
      "computeworkloads",
      "123e4567-e89b-12d3-a456-426614174001",
      { status: expect.objectContaining({ phase: "Ready", failure: null }) },
      undefined,
      "compute-workload-controller",
      undefined,
      expect.any(Object)
    );
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

    await expect(
      elector.acquireOrRenew(new Date("2026-09-01T12:00:00.226Z"))
    ).resolves.toBe(true);
    expect(elector.isLeader()).toBe(true);
    expect(createNamespacedLease).toHaveBeenCalledWith(
      "cogni-candidate-a",
      expect.objectContaining({
        spec: expect.objectContaining({
          holderIdentity: "pod-a",
          // MicroTime: the API server 400s anything without exactly six
          // fractional digits; the 0.22 client serializes Date with three.
          acquireTime: "2026-09-01T12:00:00.226000Z",
          renewTime: "2026-09-01T12:00:00.226000Z",
        }),
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

describe("KubernetesLeaseLeaderElector transient-failure tolerance", () => {
  function heldLease(renewTime: string): V1Lease {
    return {
      metadata: { resourceVersion: "11" },
      spec: {
        holderIdentity: "pod-a",
        renewTime: new Date(renewTime),
        leaseDurationSeconds: 30,
        leaseTransitions: 1,
      },
    };
  }

  it("keeps leadership across consecutive read failures inside the lease deadline", async () => {
    const lease = heldLease("2026-09-01T12:00:00.000Z");
    let failing = false;
    const api = {
      readNamespacedLease: vi.fn(async () => {
        if (failing) throw apiError(500);
        return { body: lease };
      }),
      replaceNamespacedLease: vi.fn(async () => ({ body: lease })),
    } as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-production",
      "compute-workload-controller",
      "pod-a"
    );

    await expect(
      elector.acquireOrRenew(new Date("2026-09-01T12:00:01.000Z"))
    ).resolves.toBe(true);

    failing = true;
    // Five consecutive 5s ticks — the whole window a 30s lease can absorb.
    for (let tick = 1; tick <= 5; tick += 1) {
      const now = new Date(
        Date.parse("2026-09-01T12:00:01.000Z") + tick * 5_000
      );
      await expect(elector.acquireOrRenew(now)).rejects.toMatchObject({
        statusCode: 500,
      });
      expect(elector.isLeader()).toBe(true);
      expect(elector.leadershipLoss(now)).toBeUndefined();
    }
  });

  it("reports LeaseExpired once the observed deadline passes without a renew", () => {
    const api = {} as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-production",
      "compute-workload-controller",
      "pod-a"
    );

    // Never observed: fail closed rather than assume leadership.
    expect(
      elector.leadershipLoss(new Date("2026-09-01T12:00:00.000Z"))
    ).toEqual({ reason: "LeaseExpired" });
  });

  it("expires leadership when the deadline passes and detects a different holder", async () => {
    const lease = heldLease("2026-09-01T12:00:00.000Z");
    let current: V1Lease = lease;
    let failing = false;
    const api = {
      readNamespacedLease: vi.fn(async () => {
        if (failing) throw apiError(503);
        return { body: current };
      }),
      replaceNamespacedLease: vi.fn(async () => ({ body: current })),
    } as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-production",
      "compute-workload-controller",
      "pod-a"
    );

    await elector.acquireOrRenew(new Date("2026-09-01T12:00:01.000Z"));
    expect(
      elector.leadershipLoss(new Date("2026-09-01T12:00:30.000Z"))
    ).toBeUndefined();
    failing = true;
    await expect(
      elector.acquireOrRenew(new Date("2026-09-01T12:00:32.000Z"))
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(
      elector.leadershipLoss(new Date("2026-09-01T12:00:32.000Z"))
    ).toEqual({
      reason: "LeaseExpired",
      holderIdentity: "pod-a",
      deadline: "2026-09-01T12:00:31.000Z",
    });

    // The API server recovers and another replica now holds the lease.
    failing = false;
    current = {
      metadata: { resourceVersion: "12" },
      spec: {
        holderIdentity: "pod-b",
        renewTime: new Date("2026-09-01T12:00:35.000Z"),
        leaseDurationSeconds: 30,
        leaseTransitions: 2,
      },
    };
    await expect(
      elector.acquireOrRenew(new Date("2026-09-01T12:00:36.000Z"))
    ).resolves.toBe(false);
    expect(elector.isLeader()).toBe(false);
    expect(
      elector.leadershipLoss(new Date("2026-09-01T12:00:36.000Z"))
    ).toMatchObject({ reason: "HolderChanged", holderIdentity: "pod-b" });
  });

  it("treats a lost replace race as transient rather than a lost lease", async () => {
    const lease = heldLease("2026-09-01T12:00:00.000Z");
    let conflict = false;
    const api = {
      readNamespacedLease: vi.fn(async () => ({ body: lease })),
      replaceNamespacedLease: vi.fn(async () => {
        if (conflict) throw apiError(409);
        return { body: lease };
      }),
    } as unknown as CoordinationV1Api;
    const elector = new KubernetesLeaseLeaderElector(
      api,
      "cogni-production",
      "compute-workload-controller",
      "pod-a"
    );

    await elector.acquireOrRenew(new Date("2026-09-01T12:00:01.000Z"));
    conflict = true;
    await expect(
      elector.acquireOrRenew(new Date("2026-09-01T12:00:06.000Z"))
    ).resolves.toBe(false);
    expect(
      elector.leadershipLoss(new Date("2026-09-01T12:00:06.000Z"))
    ).toBeUndefined();
  });
});

describe("renewLeadershipOrFence", () => {
  function fenceCallback(): {
    fence: (cause: unknown, loss: LeadershipLoss) => never;
    calls: Array<{ cause: unknown; loss: LeadershipLoss }>;
    fenced: Error;
  } {
    const calls: Array<{ cause: unknown; loss: LeadershipLoss }> = [];
    const fenced = new Error("process fenced");
    return {
      calls,
      fenced,
      fence: (cause, loss) => {
        calls.push({ cause, loss });
        throw fenced;
      },
    };
  }

  it("defers instead of fencing while renewal fails inside the lease deadline", async () => {
    const failure = apiError(500);
    const { fence, calls } = fenceCallback();
    const deferred: unknown[] = [];
    const lease = {
      isLeader: () => true,
      acquireOrRenew: vi.fn(async () => {
        throw failure;
      }),
      leadershipLoss: () => undefined,
    };

    for (let tick = 0; tick < 5; tick += 1) {
      await expect(
        renewLeadershipOrFence(lease, fence, (cause) => deferred.push(cause))
      ).resolves.toBe(false);
    }
    expect(calls).toHaveLength(0);
    expect(deferred).toEqual([failure, failure, failure, failure, failure]);
    expect(lease.isLeader()).toBe(true);
  });

  it("defers an unsuccessful renew that is not a proven loss", async () => {
    const { fence, calls } = fenceCallback();
    const deferred: unknown[] = [];
    await expect(
      renewLeadershipOrFence(
        {
          isLeader: () => true,
          acquireOrRenew: async () => false,
          leadershipLoss: () => undefined,
        },
        fence,
        (cause) => deferred.push(cause)
      )
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
    expect(deferred[0]).toBeInstanceOf(Error);
  });

  it("fences when renewal fails past the lease deadline", async () => {
    const failure = apiError(503);
    const { fence, calls, fenced } = fenceCallback();
    const deferred: unknown[] = [];
    await expect(
      renewLeadershipOrFence(
        {
          isLeader: () => true,
          acquireOrRenew: async () => {
            throw failure;
          },
          leadershipLoss: () => ({
            reason: "LeaseExpired" as const,
            deadline: "2026-09-01T12:00:31.000Z",
          }),
        },
        fence,
        (cause) => deferred.push(cause)
      )
    ).rejects.toBe(fenced);
    expect(deferred).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.cause).toBe(failure);
    expect(calls[0]?.loss.reason).toBe("LeaseExpired");
  });

  it("fences immediately when another identity holds the lease, deadline notwithstanding", async () => {
    const { fence, calls, fenced } = fenceCallback();
    const deferred: unknown[] = [];
    await expect(
      renewLeadershipOrFence(
        {
          isLeader: () => true,
          acquireOrRenew: async () => false,
          leadershipLoss: () => ({
            reason: "HolderChanged" as const,
            holderIdentity: "pod-b",
            // Deadline is still in the future; the holder change alone fences.
            deadline: "2999-01-01T00:00:00.000Z",
          }),
        },
        fence,
        (cause) => deferred.push(cause)
      )
    ).rejects.toBe(fenced);
    expect(deferred).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.loss).toMatchObject({
      reason: "HolderChanged",
      holderIdentity: "pod-b",
    });
  });

  it("never fences an ordinary follower and propagates its renewal error", async () => {
    const failure = apiError(500);
    const { fence, calls } = fenceCallback();
    await expect(
      renewLeadershipOrFence(
        {
          isLeader: () => false,
          acquireOrRenew: async () => {
            throw failure;
          },
          leadershipLoss: () => ({ reason: "LeaseExpired" as const }),
        },
        fence
      )
    ).rejects.toBe(failure);
    await expect(
      renewLeadershipOrFence(
        {
          isLeader: () => false,
          acquireOrRenew: async () => false,
          leadershipLoss: () => ({ reason: "LeaseExpired" as const }),
        },
        fence
      )
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("describeKubernetesError", () => {
  it("carries the message, HTTP status, and API reason a fence log needs", () => {
    const error = Object.assign(new Error("socket hang up"), {
      statusCode: 500,
      body: { reason: "InternalError" },
    });
    expect(describeKubernetesError(error)).toEqual({
      causeType: "Error",
      causeMessage: "socket hang up",
      causeStatus: 500,
      causeReason: "InternalError",
    });
    expect(describeKubernetesError("boom")).toEqual({
      causeType: "string",
      causeMessage: "boom",
    });
  });
});
