// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Provider-neutral external workload lifecycle used by the ComputeWorkload controller.
 * Provider vocabulary and manifests are adapter-private; resourceId is always opaque.
 */

import type { ProvisionOutput, ProvisionSpec } from "@cogni/ai-tools";

export type ComputeLifecycleFailureKind =
  | "not_found"
  | "transient"
  | "terminal"
  | "unknown_outcome";

export class ComputeLifecycleError extends Error {
  constructor(
    public readonly kind: ComputeLifecycleFailureKind,
    /** Stable redacted code safe for CR status, Events, and structured logs. */
    public readonly reason:
      | "ProviderCredentialMissing"
      | "ProviderNotFound"
      | "ProviderTransient"
      | "ProviderRejected"
      | "ProviderOutcomeUnknown"
      | "SecretResolverUnavailable"
      | "EndpointVerificationFailed",
    public readonly retryable: boolean
  ) {
    super(reason);
    this.name = "ComputeLifecycleError";
  }
}

export interface ComputeWorkloadLifecyclePort {
  observe(input: { resourceId: string }): Promise<ProvisionOutput>;
  create(input: {
    environment: string;
    spec: ProvisionSpec;
    /** Durable controller key. Providers may support it; the controller always records it first. */
    idempotencyKey: string;
    /** Persist the provider-opaque baseline before POST. */
    onPrepared(allocationCursor: string): Promise<void>;
    /** Persist the opaque provider handle immediately after allocation, before convergence. */
    onAllocated(resource: ProvisionOutput): Promise<void>;
  }): Promise<ProvisionOutput>;
  /** Resolve an uncertain create against the durable pre-POST baseline. */
  recoverCreate(input: {
    allocationCursor: string;
  }): Promise<ProvisionOutput | null>;
  update(input: {
    resourceId: string;
    environment: string;
    spec: ProvisionSpec;
    idempotencyKey: string;
  }): Promise<ProvisionOutput>;
  delete(input: { resourceId: string }): Promise<void>;
  /** Provider-independent serving proof. Ready requires the exact source SHA. */
  verifySource(input: {
    endpoints: readonly string[];
    expectedSourceSha: string;
  }): Promise<boolean>;
}
