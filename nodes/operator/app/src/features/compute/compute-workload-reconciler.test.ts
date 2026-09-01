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
import {
  ComputeLifecycleError,
  type ComputeWorkloadLifecyclePort,
} from "@/ports/compute-workload-lifecycle.port";
import type { ComputeWorkloadStatePort } from "@/ports/compute-workload-state.port";
import { reconcileComputeWorkload } from "./compute-workload-reconciler";

const NODE_ID = "123e4567-e89b-12d3-a456-426614174001";
const SHA = "a".repeat(40);
const IMAGE = `ghcr.io/cogni-dao/poly@sha256:${"b".repeat(64)}`;
const NOW = new Date("2026-09-01T12:00:00.000Z");

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
        ref: `ghcr.io/cogni-dao/poly-bundle@sha256:${"c".repeat(64)}`,
        source: { repository: "cogni-dao/poly", sha: SHA },
        artifacts: [{ name: "app", image: IMAGE }],
      },
      workload: {
        name: "poly",
        services: [
          {
            name: "app",
            artifact: "app",
            cpuUnits: 0.5,
            memoryMi: 512,
            storageMi: 1024,
            env: { PAPER_TRADER_URL: "http://paper-trader:9100" },
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
      ref: `ghcr.io/cogni-dao/poly-bundle@sha256:${"c".repeat(64)}`,
      source: { repository: "cogni-dao/poly", sha: SHA },
      artifacts: [{ name: "app", image: IMAGE }],
    },
    resource: {
      provider: "external",
      id: "lease-42",
      state,
      endpoints: ["https://poly.example"],
    },
    recoveryCount: 0,
    conditions: [],
  };
}

class MemoryState implements ComputeWorkloadStatePort {
  readonly events: { type: string; reason: string; message: string }[] = [];
  claimResult = true;
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
      endpoints: ["https://poly.example"],
    })),
    create: vi.fn(
      async (input: Parameters<ComputeWorkloadLifecyclePort["create"]>[0]) => {
        await input.onPrepared("41");
        const output = {
          provider: "external",
          leaseId: "lease-42",
          state: "active" as const,
          endpoints: ["https://poly.example"],
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
      endpoints: ["https://poly.example"],
    })),
    delete: vi.fn(async () => {}),
    verifySource: vi.fn(async () => true),
  };
}

async function run(state: MemoryState, port: ComputeWorkloadLifecyclePort) {
  await reconcileComputeWorkload(
    {
      lifecycle: port,
      state,
      environment: "candidate-a",
      leaderEpoch: "7:test-controller",
      assertLeadership: async (epoch) => epoch === "7:test-controller",
      now: () => NOW,
    },
    state.current
  );
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
    await run(state, port);
    const receipt = decodeAttemptReceipt(
      state.current.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]
    );
    expect(receipt).toMatchObject({
      allocationCursor: "41",
      resource: { id: "lease-42" },
      outcome: "succeeded",
    });
    expect(state.current.status?.resource?.id).toBe("lease-42");
    await run(state, port);
    expect(state.current.status?.phase).toBe("Ready");
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
      endpoints: ["https://poly.example"],
    });
    port.observe.mockResolvedValueOnce({
      provider: "external",
      leaseId: "42",
      state: "active",
      endpoints: ["https://poly.example"],
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
        status: status(),
      })
    );
    const port = lifecycle();
    await run(state, port);
    expect(port.delete).toHaveBeenCalledWith({ resourceId: "lease-42" });
    // closeKnown is durably receipted first; the next level pass observes closed and finalizes.
    port.observe.mockResolvedValueOnce({
      provider: "external",
      leaseId: "lease-42",
      state: "closed",
      endpoints: [],
    });
    await run(state, port);
    expect(state.current.metadata.finalizers).not.toContain(
      COMPUTE_WORKLOAD_FINALIZER
    );
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
