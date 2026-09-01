// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it, vi } from "vitest";
import {
  COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION,
  COMPUTE_WORKLOAD_FINALIZER,
  type ComputeWorkload,
  type ComputeWorkloadStatus,
} from "@/ports/compute-workload.types";
import type { ComputeWorkloadLifecyclePort } from "@/ports/compute-workload-lifecycle.port";
import { ComputeLifecycleError } from "@/ports/compute-workload-lifecycle.port";
import type { ComputeWorkloadStatePort } from "@/ports/compute-workload-state.port";

import { reconcileComputeWorkload } from "./compute-workload-reconciler";

const SHA = "a".repeat(40);
const DIGEST = `sha256:${"b".repeat(64)}`;
const NOW = new Date("2026-09-01T12:00:00.000Z");

function workload(overrides: Partial<ComputeWorkload> = {}): ComputeWorkload {
  const base: ComputeWorkload = {
    apiVersion: "compute.cogni.io/v1alpha1",
    kind: "ComputeWorkload",
    metadata: {
      name: "poly",
      namespace: "cogni-candidate-a",
      uid: "123e4567-e89b-12d3-a456-426614174000",
      generation: 1,
      labels: {
        "cogni.io/node-id": "123e4567-e89b-12d3-a456-426614174001",
        "cogni.io/environment": "candidate-a",
      },
      finalizers: [COMPUTE_WORKLOAD_FINALIZER],
    },
    spec: {
      nodeId: "123e4567-e89b-12d3-a456-426614174001",
      environment: "candidate-a",
      sourceSha: SHA,
      artifactDigests: { app: DIGEST },
      workload: {
        name: "poly",
        services: [
          {
            name: "app",
            image: `ghcr.io/cogni-dao/poly@${DIGEST}`,
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
  input: {
    generation?: number;
    state?: "pending" | "active" | "closed" | "unknown";
  } = {}
): ComputeWorkloadStatus {
  const generation = input.generation ?? 1;
  return {
    phase: "Progressing",
    desiredGeneration: generation,
    observedGeneration: generation,
    sourceSha: SHA,
    artifactDigests: { app: DIGEST },
    resource: {
      provider: "external",
      id: "lease-42",
      state: input.state ?? "active",
      endpoints: ["https://poly.example"],
    },
    recoveryCount: 0,
    conditions: [],
  };
}

class MemoryState implements ComputeWorkloadStatePort {
  readonly events: { type: string; reason: string; message: string }[] = [];

  constructor(public current: ComputeWorkload) {}

  async list(): Promise<readonly ComputeWorkload[]> {
    return [this.current];
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

function lifecycle(): ComputeWorkloadLifecyclePort & {
  observe: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  verifySource: ReturnType<typeof vi.fn>;
} {
  return {
    observe: vi.fn(async () => ({
      provider: "external",
      leaseId: "lease-42",
      state: "active" as const,
      endpoints: ["https://poly.example"],
    })),
    create: vi.fn(async () => ({
      provider: "external",
      leaseId: "lease-42",
      state: "active" as const,
      endpoints: ["https://poly.example"],
    })),
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
    { lifecycle: port, state, environment: "candidate-a", now: () => NOW },
    state.current
  );
}

describe("reconcileComputeWorkload", () => {
  it("persists the finalizer before the first provider mutation", async () => {
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

  it("creates once, records the durable handle, then becomes Ready on exact source proof", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();

    await run(state, port);
    expect(port.create).toHaveBeenCalledTimes(1);
    expect(state.current.status?.resource?.id).toBe("lease-42");
    expect(state.current.status?.phase).toBe("Progressing");

    await run(state, port);
    expect(port.create).toHaveBeenCalledTimes(1);
    expect(state.current.status?.phase).toBe("Ready");
    expect(state.current.status?.observedGeneration).toBe(1);
    expect(state.current.status?.conditions[0]).toMatchObject({
      status: "True",
      observedGeneration: 1,
      reason: "SourceVerified",
    });
  });

  it("adopts a known durable handle after restart without creating", async () => {
    const state = new MemoryState(workload({ status: status() }));
    const port = lifecycle();

    await run(state, port);

    expect(port.observe).toHaveBeenCalledWith({ resourceId: "lease-42" });
    expect(port.create).not.toHaveBeenCalled();
    expect(state.current.status?.phase).toBe("Ready");
  });

  it("fails closed after an unknown initial create and never blindly duplicates", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    port.create.mockRejectedValueOnce(
      new ComputeLifecycleError("unknown_outcome", "socket closed", false)
    );

    await run(state, port);
    await run(state, port);

    expect(port.create).toHaveBeenCalledTimes(1);
    expect(state.current.status?.phase).toBe("Unknown");
    expect(
      state.current.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]
    ).toBe(state.current.status?.attempt?.key);
  });

  it("treats CR-status loss after a durable mutation marker as orphan risk", async () => {
    const state = new MemoryState(
      workload({
        metadata: {
          ...workload().metadata,
          annotations: {
            [COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]:
              "cogni-candidate-a:poly:uid:1:create:0",
          },
        },
      })
    );
    const port = lifecycle();

    await run(state, port);

    expect(port.create).not.toHaveBeenCalled();
    expect(state.current.status?.phase).toBe("Unknown");
    expect(state.current.status?.failure?.reason).toBe("OrphanRisk");
  });

  it("does not retry a provider-declared terminal mutation", async () => {
    const state = new MemoryState(workload());
    const port = lifecycle();
    port.create.mockRejectedValueOnce(
      new ComputeLifecycleError("terminal", "manifest rejected", false)
    );

    await run(state, port);
    await run(state, port);

    expect(port.create).toHaveBeenCalledTimes(1);
    expect(state.current.status?.phase).toBe("Failed");
    expect(state.current.status?.failure?.retryable).toBe(false);
  });

  it("fails closed after an unknown recovery create and does not replay it", async () => {
    const state = new MemoryState(
      workload({ status: status({ state: "closed" }) })
    );
    const port = lifecycle();
    port.observe.mockResolvedValue({
      provider: "external",
      leaseId: "lease-42",
      state: "closed",
      endpoints: [],
    });
    port.create.mockRejectedValueOnce(
      new ComputeLifecycleError("unknown_outcome", "timeout after POST", false)
    );

    await run(state, port);
    await run(state, port);

    expect(port.create).toHaveBeenCalledTimes(1);
    expect(state.current.status?.phase).toBe("Unknown");
    expect(state.current.status?.failure?.reason).toBe(
      "MutationOutcomeUnknown"
    );
  });

  it("updates the known resource in place for a new Git generation", async () => {
    const state = new MemoryState(
      workload({
        metadata: { ...workload().metadata, generation: 2 },
        status: status({ generation: 1 }),
      })
    );
    const port = lifecycle();

    await run(state, port);

    expect(port.update).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: "lease-42" })
    );
    expect(port.create).not.toHaveBeenCalled();
    expect(state.current.status?.observedGeneration).toBe(2);
    expect(state.current.status?.phase).toBe("Progressing");
  });

  it("does not replay an in-place update whose provider outcome is unknown", async () => {
    const state = new MemoryState(
      workload({
        metadata: { ...workload().metadata, generation: 2 },
        status: status({ generation: 1 }),
      })
    );
    const port = lifecycle();
    port.update.mockRejectedValueOnce(
      new ComputeLifecycleError("unknown_outcome", "timeout after PUT", false)
    );

    await run(state, port);
    await run(state, port);

    expect(port.update).toHaveBeenCalledTimes(1);
    expect(port.create).not.toHaveBeenCalled();
    expect(state.current.status?.phase).toBe("Unknown");
  });

  it("keeps the finalizer when delete outcome is unknown", async () => {
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
    port.delete.mockRejectedValue(
      new ComputeLifecycleError("unknown_outcome", "delete timeout", false)
    );

    await run(state, port);

    expect(state.current.metadata.finalizers).toContain(
      COMPUTE_WORKLOAD_FINALIZER
    );
    expect(state.current.status?.phase).toBe("Unknown");
  });

  it("deletes the external resource before removing the owner finalizer", async () => {
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
    expect(state.current.metadata.finalizers).not.toContain(
      COMPUTE_WORKLOAD_FINALIZER
    );
  });

  it("rejects node/environment ownership drift before provider IO", async () => {
    const state = new MemoryState(
      workload({
        metadata: {
          ...workload().metadata,
          labels: {
            ...workload().metadata.labels,
            "cogni.io/environment": "preview",
          },
        },
      })
    );
    const port = lifecycle();

    await run(state, port);

    expect(state.current.status?.failure?.reason).toBe("OwnershipMismatch");
    expect(port.create).not.toHaveBeenCalled();
    expect(port.observe).not.toHaveBeenCalled();
  });
});
