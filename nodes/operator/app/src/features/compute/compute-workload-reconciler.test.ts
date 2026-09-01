// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it, vi } from "vitest";
import {
  COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION,
  COMPUTE_WORKLOAD_FINALIZER,
  type ComputeWorkload,
  type ComputeWorkloadStatus,
  decodeAttemptReceipt,
} from "@/ports/compute-workload.types";
import type { ComputeWorkloadDnsPort } from "@/ports/compute-workload-dns.port";
import {
  ComputeLifecycleError,
  type ComputeWorkloadLifecyclePort,
} from "@/ports/compute-workload-lifecycle.port";
import type { ComputeWorkloadSecretResolverPort } from "@/ports/compute-workload-secret-resolver.port";
import type { ComputeWorkloadStatePort } from "@/ports/compute-workload-state.port";
import { reconcileComputeWorkload } from "./compute-workload-reconciler";

const NODE_ID = "123e4567-e89b-12d3-a456-426614174001";
const SHA = "a".repeat(40);
const IMAGE = `ghcr.io/cogni-dao/sample-node@sha256:${"b".repeat(64)}`;
const NOW = new Date("2026-09-01T12:00:00.000Z");
const BOOTABLE_APP_ENV = {
  AUTH_SECRET: "auth-secret",
  DATABASE_URL: "postgresql://app@candidate.vm.example/app",
  DATABASE_SERVICE_URL: "postgresql://service@candidate.vm.example/app",
  DOLTGRES_URL: "postgresql://app@candidate.vm.example/knowledge",
  LITELLM_MASTER_KEY: "sk-virtual",
};

function workload(overrides: Partial<ComputeWorkload> = {}): ComputeWorkload {
  const base: ComputeWorkload = {
    apiVersion: "compute.cogni.io/v1alpha1",
    kind: "ComputeWorkload",
    metadata: {
      name: NODE_ID,
      namespace: "cogni-candidate-a",
      uid: "123e4567-e89b-12d3-a456-426614174000",
      generation: 1,
      resourceVersion: "1",
      labels: {
        "cogni.io/node-id": NODE_ID,
        "cogni.io/environment": "candidate-a",
      },
      finalizers: [COMPUTE_WORKLOAD_FINALIZER],
    },
    spec: {
      nodeId: NODE_ID,
      environment: "candidate-a",
      bundle: {
        ref: `ghcr.io/cogni-dao/sample-node-bundle@sha256:${"c".repeat(64)}`,
        source: { repository: "cogni-dao/sample-node", sha: SHA },
        artifacts: [{ name: "app", image: IMAGE }],
      },
      workload: {
        name: "sample-node",
        publicHost: "sample-node-test.cognidao.org",
        services: [
          {
            name: "app",
            artifact: "app",
            port: 3000,
            visibility: "public",
            bindings: {},
            bindHost: "0.0.0.0",
            secretRefs: [
              { key: "AUTH_SECRET" },
              { key: "DATABASE_URL" },
              { key: "DATABASE_SERVICE_URL" },
              { key: "DOLTGRES_URL" },
              { key: "LITELLM_VIRTUAL_KEY" },
            ],
            cpuUnits: 0.5,
            memoryMi: 512,
            storageMi: 1024,
          },
        ],
      },
    },
  };
  return {
    ...base,
    ...overrides,
    metadata: { ...base.metadata, ...overrides.metadata },
    spec: { ...base.spec, ...overrides.spec },
  };
}

function status(
  generation = 1,
  state: "pending" | "active" | "closed" | "unknown" = "active"
): ComputeWorkloadStatus {
  return {
    phase: "Progressing",
    desiredGeneration: generation,
    observedGeneration: generation,
    observedBundle: {
      ref: `ghcr.io/cogni-dao/sample-node-bundle@sha256:${"c".repeat(64)}`,
      source: { repository: "cogni-dao/sample-node", sha: SHA },
      artifacts: [{ name: "app", image: IMAGE }],
    },
    resource: {
      provider: "external",
      id: "lease-42",
      state,
      endpoints: ["https://sample-node.example"],
    },
    recoveryCount: 0,
    conditions: [],
  };
}

class MemoryState implements ComputeWorkloadStatePort {
  readonly events: { type: string; reason: string; message: string }[] = [];
  claimResult = true;
  wallet?: {
    attemptKey: string;
    workloadUid: string;
    allocationCursor?: string;
  };
  constructor(public current: ComputeWorkload) {}

  async list(): Promise<readonly ComputeWorkload[]> {
    return [this.current];
  }
  async claimAttempt(input: {
    resource: ComputeWorkload;
    receipt: string;
  }): Promise<boolean> {
    if (
      !this.claimResult ||
      input.resource.metadata.resourceVersion !==
        this.current.metadata.resourceVersion
    )
      return false;
    await this.patchMetadata({
      resource: input.resource,
      annotations: { [COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]: input.receipt },
    });
    return true;
  }
  async claimWalletAllocation(input: {
    attemptKey: string;
    workloadUid: string;
  }): Promise<
    | { state: "claimed"; allocationCursor?: string }
    | { state: "owned"; allocationCursor?: string }
    | { state: "blocked"; ownerAttemptKey: string }
  > {
    if (!this.wallet) {
      this.wallet = input;
      return { state: "claimed" };
    }
    if (this.wallet.attemptKey !== input.attemptKey) {
      return { state: "blocked", ownerAttemptKey: this.wallet.attemptKey };
    }
    return {
      state: "owned",
      ...(this.wallet.allocationCursor
        ? { allocationCursor: this.wallet.allocationCursor }
        : {}),
    };
  }
  async prepareWalletAllocation(input: {
    attemptKey: string;
    allocationCursor: string;
  }): Promise<void> {
    if (!this.wallet || this.wallet.attemptKey !== input.attemptKey)
      throw new Error("wallet owner mismatch");
    this.wallet = { ...this.wallet, allocationCursor: input.allocationCursor };
  }
  async completeWalletAllocation(input: { attemptKey: string }): Promise<void> {
    if (this.wallet?.attemptKey === input.attemptKey) delete this.wallet;
  }
  async patchMetadata(input: {
    resource: ComputeWorkload;
    annotations?: Readonly<Record<string, string | null>>;
    finalizers?: readonly string[];
  }): Promise<void> {
    const annotations = { ...(this.current.metadata.annotations ?? {}) };
    for (const [key, value] of Object.entries(input.annotations ?? {})) {
      if (value === null) delete annotations[key];
      else annotations[key] = value;
    }
    this.current = {
      ...this.current,
      metadata: {
        ...this.current.metadata,
        annotations,
        resourceVersion: String(
          Number(this.current.metadata.resourceVersion ?? "0") + 1
        ),
        ...(input.finalizers ? { finalizers: input.finalizers } : {}),
      },
    };
  }
  async patchStatus(input: {
    resource: ComputeWorkload;
    status: ComputeWorkloadStatus;
  }): Promise<void> {
    this.current = { ...this.current, status: input.status };
  }
  async event(input: {
    resource: ComputeWorkload;
    type: "Normal" | "Warning";
    reason: string;
    message: string;
  }): Promise<void> {
    this.events.push(input);
  }
}

function lifecycle(): ComputeWorkloadLifecyclePort &
  Record<
    | "observe"
    | "create"
    | "recoverCreate"
    | "update"
    | "delete"
    | "verifySource",
    ReturnType<typeof vi.fn>
  > {
  return {
    observe: vi.fn(async () => ({
      provider: "external",
      leaseId: "lease-42",
      state: "active" as const,
      endpoints: ["https://sample-node.example"],
    })),
    create: vi.fn(
      async (input: Parameters<ComputeWorkloadLifecyclePort["create"]>[0]) => {
        await input.onPrepared("41");
        const output = {
          provider: "external",
          leaseId: "lease-42",
          state: "active" as const,
          endpoints: ["https://sample-node.example"],
        };
        await input.onAllocated(output);
        return output;
      }
    ),
    recoverCreate: vi.fn(async () => null),
    update: vi.fn(async () => ({
      provider: "external",
      leaseId: "lease-42",
      state: "active" as const,
      endpoints: ["https://sample-node.example"],
    })),
    delete: vi.fn(async () => {}),
    verifySource: vi.fn(async () => true),
  };
}

async function run(
  state: MemoryState,
  port: ComputeWorkloadLifecyclePort,
  overrides: {
    dns?: ComputeWorkloadDnsPort;
    secretResolver?: ComputeWorkloadSecretResolverPort;
  } = {}
) {
  const dns = overrides.dns ?? {
    reconcile: vi.fn<ComputeWorkloadDnsPort["reconcile"]>(async () => {}),
    deleteOwned: vi.fn<ComputeWorkloadDnsPort["deleteOwned"]>(
      async () => "deleted" as const
    ),
  };
  const secretResolver = overrides.secretResolver ?? {
    resolve: vi.fn<ComputeWorkloadSecretResolverPort["resolve"]>(
      async (input) => (input.serviceName === "app" ? BOOTABLE_APP_ENV : {})
    ),
  };
  await reconcileComputeWorkload(
    {
      lifecycle: port,
      state,
      dns,
      secretResolver,
      environment: "candidate-a",
      leaderEpoch: "7:test-controller",
      assertLeadership: async (epoch) => epoch === "7:test-controller",
      now: () => NOW,
    },
    state.current
  );
  return { dns, secretResolver };
}

describe("reconcileComputeWorkload", () => {
  it("persists the finalizer before provider mutation", async () => {
    const state = new MemoryState(
      workload({ metadata: { ...workload().metadata, finalizers: [] } })
    );
    const port = lifecycle();
    await run(state, port);
    expect(state.current.metadata.finalizers).toEqual([
      COMPUTE_WORKLOAD_FINALIZER,
    ]);
    expect(port.create).not.toHaveBeenCalled();
  });

  it("persists pre-POST baseline then dseq before convergence and becomes Ready", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    const deps = await run(state, port);
    const receipt = decodeAttemptReceipt(
      state.current.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]
    );
    expect(receipt).toMatchObject({
      allocationCursor: "41",
      resource: { id: "lease-42" },
      outcome: "succeeded",
    });
    expect(state.current.status?.resource?.id).toBe("lease-42");
    await run(state, port, deps);
    expect(state.current.status?.phase).toBe("Ready");
    expect(deps.dns.reconcile).toHaveBeenCalledWith({
      hostname: "sample-node-test.cognidao.org",
      target: "sample-node.example",
    });
    expect(port.verifySource).toHaveBeenCalledWith({
      endpoints: ["https://sample-node-test.cognidao.org"],
      expectedSourceSha: SHA,
    });
    expect(port.create).toHaveBeenCalledTimes(1);
  });

  it("aborts before provider IO when the resourceVersion CAS loses", async () => {
    const state = new MemoryState(workload());
    state.claimResult = false;
    const port = lifecycle();
    await run(state, port);
    expect(port.create).not.toHaveBeenCalled();
  });

  it("adopts exactly one post-baseline dseq after an unknown POST outcome", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    port.create.mockImplementationOnce(
      async (input: Parameters<ComputeWorkloadLifecyclePort["create"]>[0]) => {
        await input.onPrepared("41");
        throw new ComputeLifecycleError(
          "unknown_outcome",
          "ProviderOutcomeUnknown",
          false
        );
      }
    );
    port.recoverCreate.mockResolvedValueOnce({
      provider: "external",
      leaseId: "42",
      state: "active",
      endpoints: ["https://sample-node.example"],
    });
    port.observe.mockResolvedValueOnce({
      provider: "external",
      leaseId: "42",
      state: "active",
      endpoints: ["https://sample-node.example"],
    });
    await run(state, port);
    await run(state, port);
    expect(port.create).toHaveBeenCalledTimes(1);
    expect(port.recoverCreate).toHaveBeenCalledWith({ allocationCursor: "41" });
    expect(state.current.status?.resource?.id).toBe("42");
  });

  it("does not retry when a prepared POST has zero adoption candidates", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    port.create.mockImplementationOnce(
      async (input: Parameters<ComputeWorkloadLifecyclePort["create"]>[0]) => {
        await input.onPrepared("41");
        throw new ComputeLifecycleError(
          "unknown_outcome",
          "ProviderOutcomeUnknown",
          false
        );
      }
    );
    await run(state, port);
    await run(state, port);
    await run(state, port);
    expect(port.create).toHaveBeenCalledTimes(1);
    expect(state.current.status?.phase).toBe("Unknown");
    expect(state.current.status?.failure?.message).not.toContain("POST");
  });

  it("blocks every other workload create behind a durable unknown wallet allocation across restart ordering", async () => {
    const state = new MemoryState(workload());
    const firstPort = lifecycle();
    firstPort.create.mockImplementationOnce(
      async (input: Parameters<ComputeWorkloadLifecyclePort["create"]>[0]) => {
        await input.onPrepared("41");
        throw new ComputeLifecycleError(
          "unknown_outcome",
          "ProviderOutcomeUnknown",
          false
        );
      }
    );
    await run(state, firstPort);
    const firstAfterCrash = state.current;
    expect(state.wallet).toMatchObject({ allocationCursor: "41" });

    const secondId = "223e4567-e89b-12d3-a456-426614174002";
    state.current = workload({
      metadata: {
        ...workload().metadata,
        name: secondId,
        uid: "223e4567-e89b-12d3-a456-426614174000",
        labels: {
          "cogni.io/node-id": secondId,
          "cogni.io/environment": "candidate-a",
        },
      },
      spec: { ...workload().spec, nodeId: secondId },
    });
    const secondPort = lifecycle();
    await run(state, secondPort);
    expect(secondPort.create).not.toHaveBeenCalled();
    expect(state.current.status?.failure?.reason).toBe(
      "WalletAllocationBlocked"
    );
    const secondBlocked = state.current;

    // Reconcile the original owner first: unique adoption is the wallet commit point.
    state.current = firstAfterCrash;
    firstPort.recoverCreate.mockResolvedValueOnce({
      provider: "external",
      leaseId: "42",
      state: "active",
      endpoints: ["https://sample-node.example"],
    });
    firstPort.observe.mockResolvedValueOnce({
      provider: "external",
      leaseId: "42",
      state: "active",
      endpoints: ["https://sample-node.example"],
    });
    await run(state, firstPort);
    expect(state.wallet).toBeUndefined();

    state.current = secondBlocked;
    await run(state, secondPort);
    expect(secondPort.create).toHaveBeenCalledTimes(1);
  });

  it("reconstructs a known handle from the durable receipt after status loss", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    await run(state, port);
    const { status: _lostStatus, ...withoutStatus } = state.current;
    state.current = withoutStatus;
    await run(state, port);
    expect(port.observe).toHaveBeenCalledWith({ resourceId: "lease-42" });
    expect(port.create).toHaveBeenCalledTimes(1);
  });

  it("surfaces missing optional credential without crashing or leaking provider text", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    port.create.mockRejectedValueOnce(
      new ComputeLifecycleError("terminal", "ProviderCredentialMissing", false)
    );
    await run(state, port);
    expect(state.current.status?.failure).toEqual({
      reason: "ProviderCredentialMissing",
      message: "external compute provider credential is not configured",
      retryable: false,
    });
  });

  it("rejects an unsafe secret before provider IO and releases the wallet slot", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    await run(state, port, {
      secretResolver: {
        resolve: vi.fn(async () => {
          throw new ComputeLifecycleError(
            "terminal",
            "SecretPolicyRejected",
            false
          );
        }),
      },
    });
    expect(port.create).not.toHaveBeenCalled();
    expect(state.wallet).toBeUndefined();
    expect(state.current.status?.failure?.reason).toBe("SecretPolicyRejected");
  });

  it("updates the known resource in place for a new generation", async () => {
    const state = new MemoryState(
      workload({
        metadata: { ...workload().metadata, generation: 2 },
        status: status(1),
      })
    );
    const port = lifecycle();
    await run(state, port);
    expect(port.update).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "lease-42" })
    );
    expect(port.create).not.toHaveBeenCalled();
  });

  it("does not replay an update with unknown outcome", async () => {
    const state = new MemoryState(
      workload({
        metadata: { ...workload().metadata, generation: 2 },
        status: status(1),
      })
    );
    const port = lifecycle();
    port.update.mockRejectedValueOnce(
      new ComputeLifecycleError(
        "unknown_outcome",
        "ProviderOutcomeUnknown",
        false
      )
    );
    await run(state, port);
    await run(state, port);
    expect(port.update).toHaveBeenCalledTimes(1);
    expect(state.current.status?.phase).toBe("Unknown");
  });

  it("deletes the owner-bound resource before removing its finalizer", async () => {
    const state = new MemoryState(
      workload({
        metadata: {
          ...workload().metadata,
          deletionTimestamp: NOW.toISOString(),
        },
        status: {
          ...status(),
          dns: {
            hostname: "sample-node-test.cognidao.org",
            target: "sample-node.example",
          },
        },
      })
    );
    const port = lifecycle();
    const deps = await run(state, port);
    expect(deps.dns.deleteOwned).toHaveBeenCalledWith({
      hostname: "sample-node-test.cognidao.org",
      expectedTarget: "sample-node.example",
    });
    expect(port.delete).toHaveBeenCalledWith({ resourceId: "lease-42" });
    // closeKnown is durably receipted first; the next level pass observes closed and finalizes.
    port.observe.mockResolvedValueOnce({
      provider: "external",
      leaseId: "lease-42",
      state: "closed",
      endpoints: [],
    });
    await run(state, port, deps);
    expect(state.current.metadata.finalizers).not.toContain(
      COMPUTE_WORKLOAD_FINALIZER
    );
  });

  it("derives private sibling URLs and keeps resolved values outside durable state", async () => {
    const secretValue = "never-persist-this";
    const declared = workload();
    const appService = declared.spec.workload.services[0];
    if (!appService) throw new Error("app fixture missing");
    const state = new MemoryState(
      workload({
        spec: {
          ...declared.spec,
          bundle: {
            ...declared.spec.bundle,
            source: {
              ...declared.spec.bundle.source,
              repository: "cogni-dao/sample-node",
            },
            artifacts: [
              ...declared.spec.bundle.artifacts,
              {
                name: "echo-sidecar",
                image: IMAGE.replace("sample-node@", "echo-sidecar@"),
              },
            ],
          },
          workload: {
            ...declared.spec.workload,
            name: "sample-node",
            publicHost: "sample-node-test.cognidao.org",
            services: [
              {
                ...appService,
                bindings: { ECHO_SIDECAR_URL: "echo-sidecar" },
                secretRefs: [{ key: "AUTH_SECRET" }],
              },
              {
                name: "echo-sidecar",
                artifact: "echo-sidecar",
                port: 9100,
                visibility: "private",
                bindings: {},
                bindHost: "0.0.0.0",
                cpuUnits: 0.5,
                memoryMi: 512,
                storageMi: 1024,
              },
            ],
          },
        },
      })
    );
    const port = lifecycle();
    const resolver = {
      resolve: vi.fn(async (input: { serviceName: string }) =>
        input.serviceName === "app"
          ? {
              AUTH_SECRET: secretValue,
              DATABASE_URL: "postgresql://app@candidate.vm.example/app",
              DATABASE_SERVICE_URL:
                "postgresql://service@candidate.vm.example/app",
              DOLTGRES_URL: "postgresql://app@candidate.vm.example/knowledge",
              LITELLM_MASTER_KEY: "sk-virtual",
            }
          : {}
      ),
    };
    await run(state, port, { secretResolver: resolver });
    const spec = port.create.mock.calls[0]?.[0].spec;
    expect(spec.services[0]?.env).toMatchObject({
      HOST: "0.0.0.0",
      ECHO_SIDECAR_URL: "http://echo-sidecar:9100",
      AUTH_SECRET: secretValue,
      NODE_NAME: "sample-node",
      COGNI_REPO_PATH: "/app",
      NEXTAUTH_URL: "https://sample-node-test.cognidao.org",
      APP_BASE_URL: "https://sample-node-test.cognidao.org",
      TEMPORAL_ADDRESS: "candidate.vm.example:7233",
      LITELLM_BASE_URL: "http://candidate.vm.example:4000",
    });
    expect(spec.services[1]?.env).not.toHaveProperty("NODE_NAME");
    expect(spec.services[1]?.expose).toEqual([
      { port: 9100, as: 9100, global: false },
    ]);
    expect(JSON.stringify(state.current)).not.toContain(secretValue);
    expect(JSON.stringify(state.events)).not.toContain(secretValue);
  });

  it("rejects ownership drift before provider IO", async () => {
    const state = new MemoryState(
      workload({ metadata: { ...workload().metadata, name: "wrong" } })
    );
    const port = lifecycle();
    await run(state, port);
    expect(state.current.status?.failure?.reason).toBe("OwnershipMismatch");
    expect(port.create).not.toHaveBeenCalled();
  });
});
