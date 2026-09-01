// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import {
  type CoordinationV1Api,
  type CoreV1Api,
  type CoreV1Event,
  type CustomObjectsApi,
  PatchUtils,
  type V1Lease,
} from "@kubernetes/client-node";
import type {
  ComputeWorkload,
  ComputeWorkloadStatus,
} from "@/ports/compute-workload.types";
import type { ComputeWorkloadStatePort } from "@/ports/compute-workload-state.port";

const GROUP = "compute.cogni.io";
const VERSION = "v1alpha1";
const PLURAL = "computeworkloads";
const PATCH_HEADERS = {
  headers: { "content-type": PatchUtils.PATCH_FORMAT_JSON_MERGE_PATCH },
};

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    statusCode?: number;
    response?: { statusCode?: number };
  };
  return candidate.statusCode ?? candidate.response?.statusCode;
}

/** Kubernetes API adapter: Git/Argo owns spec; this adapter owns metadata guards + status. */
export class KubernetesComputeWorkloadStateAdapter
  implements ComputeWorkloadStatePort
{
  constructor(
    private readonly custom: CustomObjectsApi,
    private readonly core: CoreV1Api,
    private readonly namespace: string,
    private readonly instanceIdentity: string
  ) {}

  async list(): Promise<readonly ComputeWorkload[]> {
    const response = await this.custom.listNamespacedCustomObject(
      GROUP,
      VERSION,
      this.namespace,
      PLURAL
    );
    const body = response.body as { items?: ComputeWorkload[] };
    return body.items ?? [];
  }

  async claimAttempt(input: {
    resource: ComputeWorkload;
    receipt: string;
  }): Promise<boolean> {
    const resourceVersion = input.resource.metadata.resourceVersion;
    if (!resourceVersion) {
      throw new Error(
        "ComputeWorkload metadata.resourceVersion is required for mutation CAS"
      );
    }
    try {
      await this.custom.patchNamespacedCustomObject(
        GROUP,
        VERSION,
        this.namespace,
        PLURAL,
        input.resource.metadata.name,
        {
          metadata: {
            resourceVersion,
            annotations: {
              ["compute.cogni.io/last-attempt"]: input.receipt,
            },
          },
        },
        undefined,
        "compute-workload-controller",
        undefined,
        PATCH_HEADERS
      );
      return true;
    } catch (error) {
      if (statusCode(error) === 409) return false;
      throw error;
    }
  }

  async patchMetadata(input: {
    resource: ComputeWorkload;
    annotations?: Readonly<Record<string, string | null>>;
    finalizers?: readonly string[];
  }): Promise<void> {
    await this.custom.patchNamespacedCustomObject(
      GROUP,
      VERSION,
      this.namespace,
      PLURAL,
      input.resource.metadata.name,
      {
        metadata: {
          ...(input.annotations ? { annotations: input.annotations } : {}),
          ...(input.finalizers ? { finalizers: input.finalizers } : {}),
        },
      },
      undefined,
      "compute-workload-controller",
      undefined,
      PATCH_HEADERS
    );
  }

  async patchStatus(input: {
    resource: ComputeWorkload;
    status: ComputeWorkloadStatus;
  }): Promise<void> {
    await this.custom.patchNamespacedCustomObjectStatus(
      GROUP,
      VERSION,
      this.namespace,
      PLURAL,
      input.resource.metadata.name,
      { status: input.status },
      undefined,
      "compute-workload-controller",
      undefined,
      PATCH_HEADERS
    );
  }

  async event(input: {
    resource: ComputeWorkload;
    type: "Normal" | "Warning";
    reason: string;
    message: string;
  }): Promise<void> {
    const now = new Date();
    const body: CoreV1Event = {
      metadata: {
        generateName: `${input.resource.metadata.name.toLowerCase()}-`,
        namespace: this.namespace,
      },
      involvedObject: {
        apiVersion: input.resource.apiVersion,
        kind: input.resource.kind,
        name: input.resource.metadata.name,
        namespace: this.namespace,
        uid: input.resource.metadata.uid,
      },
      type: input.type,
      reason: input.reason,
      message: input.message.slice(0, 1024),
      source: { component: "compute-workload-controller" },
      reportingComponent: "compute.cogni.io/controller",
      reportingInstance: this.instanceIdentity,
      firstTimestamp: now,
      lastTimestamp: now,
      count: 1,
    };
    await this.core.createNamespacedEvent(this.namespace, body);
  }
}

/** Lease-based leader election for the dedicated controller Deployment. */
export class KubernetesLeaseLeaderElector {
  private leader = false;
  private epoch: string | undefined;

  constructor(
    private readonly api: CoordinationV1Api,
    private readonly namespace: string,
    private readonly name: string,
    private readonly identity: string,
    private readonly leaseDurationSeconds = 30
  ) {}

  isLeader(): boolean {
    return this.leader;
  }

  currentEpoch(): string | undefined {
    return this.leader ? this.epoch : undefined;
  }

  /** Live dispatch guard used after the per-resource CAS and immediately before provider I/O. */
  async stillHolds(epoch: string, now = new Date()): Promise<boolean> {
    try {
      const lease = (
        await this.api.readNamespacedLease(this.name, this.namespace)
      ).body;
      const renewedAt = lease.spec?.renewTime
        ? new Date(lease.spec.renewTime).getTime()
        : 0;
      const duration =
        (lease.spec?.leaseDurationSeconds ?? this.leaseDurationSeconds) * 1000;
      const live = now.getTime() <= renewedAt + duration;
      const actualEpoch = `${lease.spec?.leaseTransitions ?? 0}:${lease.spec?.holderIdentity ?? ""}`;
      return (
        this.leader &&
        live &&
        lease.spec?.holderIdentity === this.identity &&
        actualEpoch === epoch
      );
    } catch {
      return false;
    }
  }

  async acquireOrRenew(now = new Date()): Promise<boolean> {
    let existing: V1Lease | undefined;
    try {
      existing = (await this.api.readNamespacedLease(this.name, this.namespace))
        .body;
    } catch (error) {
      if (statusCode(error) !== 404) {
        this.leader = false;
        this.epoch = undefined;
        throw error;
      }
    }

    if (!existing) {
      try {
        await this.api.createNamespacedLease(this.namespace, {
          metadata: { name: this.name, namespace: this.namespace },
          spec: {
            holderIdentity: this.identity,
            leaseDurationSeconds: this.leaseDurationSeconds,
            acquireTime: now,
            renewTime: now,
            leaseTransitions: 0,
          },
        });
        this.leader = true;
        this.epoch = `0:${this.identity}`;
        return true;
      } catch (error) {
        if (statusCode(error) !== 409) throw error;
        this.leader = false;
        this.epoch = undefined;
        return false;
      }
    }

    const holder = existing.spec?.holderIdentity;
    const renewedAt = existing.spec?.renewTime
      ? new Date(existing.spec.renewTime).getTime()
      : 0;
    const duration =
      (existing.spec?.leaseDurationSeconds ?? this.leaseDurationSeconds) * 1000;
    const expired = now.getTime() > renewedAt + duration;
    if (holder !== this.identity && holder && !expired) {
      this.leader = false;
      this.epoch = undefined;
      return false;
    }

    const transitioned = holder !== this.identity;
    try {
      await this.api.replaceNamespacedLease(this.name, this.namespace, {
        metadata: {
          name: this.name,
          namespace: this.namespace,
          ...(existing.metadata?.resourceVersion
            ? { resourceVersion: existing.metadata.resourceVersion }
            : {}),
        },
        spec: {
          holderIdentity: this.identity,
          leaseDurationSeconds: this.leaseDurationSeconds,
          ...(transitioned
            ? { acquireTime: now }
            : existing.spec?.acquireTime
              ? { acquireTime: existing.spec.acquireTime }
              : {}),
          renewTime: now,
          leaseTransitions:
            (existing.spec?.leaseTransitions ?? 0) + (transitioned ? 1 : 0),
        },
      });
      this.leader = true;
      this.epoch = `${(existing.spec?.leaseTransitions ?? 0) + (transitioned ? 1 : 0)}:${this.identity}`;
      return true;
    } catch (error) {
      if (statusCode(error) !== 409) throw error;
      this.leader = false;
      this.epoch = undefined;
      return false;
    }
  }
}

export interface RenewableLeaderLease {
  isLeader(): boolean;
  acquireOrRenew(): Promise<boolean>;
}

/**
 * Renew a Lease and fence a process that previously held it on any loss signal.
 * The runtime callback exits immediately: a stale process must never finish provider IO
 * while a replacement leader begins reconciling the same resource.
 */
export async function renewLeadershipOrFence(
  lease: RenewableLeaderLease,
  onLeadershipLost: (cause: unknown) => never
): Promise<boolean> {
  const previouslyHeld = lease.isLeader();
  let renewed: boolean;
  try {
    renewed = await lease.acquireOrRenew();
  } catch (error) {
    if (previouslyHeld) return onLeadershipLost(error);
    throw error;
  }
  if (previouslyHeld && !renewed) {
    return onLeadershipLost(
      new Error("previously held Kubernetes Lease was not renewed")
    );
  }
  return renewed;
}
