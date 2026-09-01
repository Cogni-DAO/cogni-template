// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import type { ProvisionServiceSpec, ProvisionState } from "@cogni/ai-tools";

export const COMPUTE_WORKLOAD_FINALIZER =
  "compute.cogni.io/external-resource" as const;
export const COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION =
  "compute.cogni.io/last-attempt" as const;

export type ComputeWorkloadPhase =
  | "Ready"
  | "Progressing"
  | "Failed"
  | "Unknown";

/** Git-safe service declaration. `env` is non-secret binding/config only. */
export type DeclaredProvisionServiceSpec = ProvisionServiceSpec & {
  /** Container arguments kept separate from the executable override. */
  readonly args?: readonly string[];
};

export interface DeclaredProvisionSpec {
  readonly name: string;
  readonly services: readonly DeclaredProvisionServiceSpec[];
}

export interface ComputeWorkloadSpec {
  readonly nodeId: string;
  readonly environment: string;
  readonly sourceSha: string;
  readonly artifactDigests: Readonly<Record<string, string>>;
  readonly workload: DeclaredProvisionSpec;
}

export interface ComputeWorkloadCondition {
  readonly type: "Ready";
  readonly status: "True" | "False" | "Unknown";
  readonly observedGeneration: number;
  readonly reason: string;
  readonly message: string;
  readonly lastTransitionTime: string;
}

export interface ComputeWorkloadAttempt {
  readonly key: string;
  readonly operation: "create" | "update" | "recover";
  readonly ordinal: number;
  readonly outcome: "in_progress" | "known_failure" | "succeeded" | "unknown";
  readonly retryCount: number;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export interface ComputeWorkloadStatus {
  readonly phase: ComputeWorkloadPhase;
  readonly desiredGeneration: number;
  readonly observedGeneration?: number;
  readonly sourceSha: string;
  readonly artifactDigests: Readonly<Record<string, string>>;
  readonly resource?: {
    readonly provider: string;
    readonly id: string;
    readonly state: ProvisionState;
    readonly endpoints: readonly string[];
  };
  readonly attempt?: ComputeWorkloadAttempt;
  readonly recoveryCount?: number;
  readonly failure?: {
    readonly reason: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly conditions: readonly ComputeWorkloadCondition[];
}

export interface ComputeWorkload {
  readonly apiVersion: "compute.cogni.io/v1alpha1";
  readonly kind: "ComputeWorkload";
  readonly metadata: {
    readonly name: string;
    readonly namespace: string;
    readonly uid: string;
    readonly generation: number;
    readonly resourceVersion?: string;
    readonly deletionTimestamp?: string;
    readonly labels?: Readonly<Record<string, string>>;
    readonly annotations?: Readonly<Record<string, string>>;
    readonly finalizers?: readonly string[];
  };
  readonly spec: ComputeWorkloadSpec;
  readonly status?: ComputeWorkloadStatus;
}

export function computeWorkloadIdempotencyKey(input: {
  resource: ComputeWorkload;
  operation: ComputeWorkloadAttempt["operation"];
  ordinal: number;
}): string {
  const { resource, operation, ordinal } = input;
  return [
    resource.metadata.namespace,
    resource.metadata.name,
    resource.metadata.uid,
    resource.metadata.generation,
    operation,
    ordinal,
  ].join(":");
}
