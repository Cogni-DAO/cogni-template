// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Level-based reconciliation for one provider-neutral ComputeWorkload resource. */

import type { ProvisionOutput, ProvisionSpec } from "@cogni/ai-tools";
import {
  COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION,
  COMPUTE_WORKLOAD_FINALIZER,
  type ComputeWorkload,
  type ComputeWorkloadAttempt,
  type ComputeWorkloadAttemptReceipt,
  type ComputeWorkloadStatus,
  computeWorkloadIdempotencyKey,
  decodeAttemptReceipt,
  encodeAttemptReceipt,
} from "@/ports/compute-workload.types";
import {
  ComputeLifecycleError,
  type ComputeWorkloadLifecyclePort,
} from "@/ports/compute-workload-lifecycle.port";
import type { ComputeWorkloadStatePort } from "@/ports/compute-workload-state.port";

const MAX_MUTATION_RETRIES = 3;

export interface ComputeWorkloadReconcileDeps {
  readonly lifecycle: ComputeWorkloadLifecyclePort;
  readonly state: ComputeWorkloadStatePort;
  readonly environment: string;
  readonly leaderEpoch: string;
  readonly assertLeadership: (epoch: string) => Promise<boolean>;
  readonly now: () => Date;
}

const SAFE_MESSAGES: Readonly<Record<string, string>> = {
  ProviderCredentialMissing:
    "external compute provider credential is not configured",
  ProviderNotFound: "external resource was not found",
  ProviderTransient: "external compute provider is temporarily unavailable",
  ProviderRejected: "external compute provider rejected the operation",
  ProviderOutcomeUnknown:
    "external provider mutation outcome is unknown; automatic replay is blocked",
  SecretResolverUnavailable: "declared runtime secrets cannot yet be resolved",
  EndpointVerificationFailed: "workload source verification did not succeed",
  MutationClaimConflict: "another controller writer claimed this generation",
  MutationOutcomeUnknown:
    "external provider mutation outcome is unknown; automatic replay is blocked",
  OrphanRisk:
    "a mutation receipt exists without a durable resource handle; automatic create is blocked",
  OwnershipMismatch: "resource ownership does not match this controller",
  RetryLimitExceeded: "known-outcome retry limit was exceeded",
  FinalizationBlocked: "external resource finalization has not completed",
  ServingVerificationPending:
    "waiting for the workload to serve the expected source revision",
};

function safeMessage(reason: string): string {
  return SAFE_MESSAGES[reason] ?? "external workload reconciliation failed";
}

function condition(
  resource: ComputeWorkload,
  now: string,
  status: "True" | "False" | "Unknown",
  reason: string
) {
  return {
    type: "Ready" as const,
    status,
    observedGeneration: resource.metadata.generation,
    reason,
    message: safeMessage(reason),
    lastTransitionTime: now,
  };
}

function baseStatus(
  resource: ComputeWorkload
): Pick<ComputeWorkloadStatus, "desiredGeneration"> {
  return { desiredGeneration: resource.metadata.generation };
}

function observedIdentity(resource: ComputeWorkload) {
  return { observedBundle: resource.spec.bundle };
}

function resourceStatus(output: ProvisionOutput) {
  return {
    provider: output.provider,
    id: output.leaseId,
    state: output.state,
    endpoints: output.endpoints,
  };
}

function toProvisionSpec(resource: ComputeWorkload): ProvisionSpec {
  const artifacts = new Map(
    resource.spec.bundle.artifacts.map((artifact) => [
      artifact.name,
      artifact.image,
    ])
  );
  const services = resource.spec.workload.services.map((service) => {
    if ((service.secretRefs?.length ?? 0) > 0) {
      throw new ComputeLifecycleError(
        "terminal",
        "SecretResolverUnavailable",
        false
      );
    }
    const image = artifacts.get(service.artifact);
    if (!image) {
      throw new ComputeLifecycleError("terminal", "ProviderRejected", false);
    }
    return {
      name: service.name,
      image,
      ...(service.env ? { env: service.env } : {}),
      ...(service.command ? { command: service.command } : {}),
      ...(service.args ? { args: service.args } : {}),
      cpuUnits: service.cpuUnits,
      memoryMi: service.memoryMi,
      storageMi: service.storageMi,
      ...(service.expose ? { expose: service.expose } : {}),
    };
  });
  return { name: resource.spec.workload.name, services } as ProvisionSpec;
}

async function emit(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  type: "Normal" | "Warning",
  reason: string
): Promise<void> {
  await deps.state
    .event({ resource, type, reason, message: safeMessage(reason) })
    .catch(() => {});
}

async function patchReceipt(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  receipt: ComputeWorkloadAttemptReceipt
): Promise<void> {
  await deps.state.patchMetadata({
    resource,
    annotations: {
      [COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]: encodeAttemptReceipt(receipt),
    },
  });
}

async function writeUnknown(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  reason: string,
  attempt?: ComputeWorkloadAttempt,
  current = resource.status?.resource
): Promise<void> {
  const now = deps.now().toISOString();
  await deps.state.patchStatus({
    resource,
    status: {
      ...baseStatus(resource),
      phase: "Unknown",
      ...(resource.status?.observedGeneration !== undefined
        ? { observedGeneration: resource.status.observedGeneration }
        : {}),
      ...(resource.status?.observedBundle
        ? { observedBundle: resource.status.observedBundle }
        : {}),
      ...(current ? { resource: current } : {}),
      ...(attempt ? { attempt } : {}),
      recoveryCount: resource.status?.recoveryCount ?? 0,
      failure: { reason, message: safeMessage(reason), retryable: false },
      conditions: [condition(resource, now, "Unknown", reason)],
    },
  });
  await emit(deps, resource, "Warning", reason);
}

function ownershipFailure(
  resource: ComputeWorkload,
  environment: string
): boolean {
  const labels = resource.metadata.labels ?? {};
  return (
    resource.spec.environment !== environment ||
    resource.metadata.name !== resource.spec.nodeId ||
    labels["cogni.io/environment"] !== resource.spec.environment ||
    labels["cogni.io/node-id"] !== resource.spec.nodeId
  );
}

function attemptReceipt(
  attempt: ComputeWorkloadAttempt,
  resource?: { provider: string; id: string }
): ComputeWorkloadAttemptReceipt {
  return {
    key: attempt.key,
    operation: attempt.operation,
    ordinal: attempt.ordinal,
    outcome: attempt.outcome,
    leaderEpoch: attempt.leaderEpoch,
    ...(attempt.allocationCursor
      ? { allocationCursor: attempt.allocationCursor }
      : {}),
    retryCount: attempt.retryCount,
    startedAt: attempt.startedAt,
    ...(resource ? { resource } : {}),
  };
}

async function beginAttempt(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  operation: ComputeWorkloadAttempt["operation"],
  ordinal: number,
  retryCount: number
): Promise<ComputeWorkloadAttempt | undefined> {
  const attempt: ComputeWorkloadAttempt = {
    key: computeWorkloadIdempotencyKey({ resource, operation, ordinal }),
    operation,
    ordinal,
    outcome: "claimed",
    retryCount,
    leaderEpoch: deps.leaderEpoch,
    startedAt: deps.now().toISOString(),
  };
  const claimed = await deps.state.claimAttempt({
    resource,
    receipt: encodeAttemptReceipt(attemptReceipt(attempt)),
  });
  if (!claimed) return undefined;
  await deps.state.patchStatus({
    resource,
    status: {
      ...baseStatus(resource),
      phase: "Progressing",
      ...(resource.status?.observedGeneration !== undefined
        ? { observedGeneration: resource.status.observedGeneration }
        : {}),
      ...(resource.status?.observedBundle
        ? { observedBundle: resource.status.observedBundle }
        : {}),
      ...(resource.status?.resource
        ? { resource: resource.status.resource }
        : {}),
      attempt,
      recoveryCount: resource.status?.recoveryCount ?? 0,
      conditions: [
        condition(
          resource,
          attempt.startedAt,
          "False",
          `${operation[0]?.toUpperCase()}${operation.slice(1)}InProgress`
        ),
      ],
    },
  });
  return attempt;
}

function lifecycleError(
  error: unknown,
  mutating: boolean
): ComputeLifecycleError {
  if (error instanceof ComputeLifecycleError) return error;
  return new ComputeLifecycleError(
    mutating ? "unknown_outcome" : "transient",
    mutating ? "ProviderOutcomeUnknown" : "ProviderTransient",
    !mutating
  );
}

async function mutate(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  operation: "create" | "update" | "recover",
  ordinal: number
): Promise<void> {
  const previous = resource.status?.attempt;
  const key = computeWorkloadIdempotencyKey({ resource, operation, ordinal });
  if (
    previous?.key === key &&
    previous.outcome === "known_failure" &&
    resource.status?.failure?.retryable === false
  )
    return;
  const retryCount = previous?.key === key ? previous.retryCount + 1 : 0;
  if (retryCount >= MAX_MUTATION_RETRIES) {
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Failed",
        ...(resource.status?.resource
          ? { resource: resource.status.resource }
          : {}),
        ...(previous ? { attempt: previous } : {}),
        recoveryCount: resource.status?.recoveryCount ?? 0,
        failure: {
          reason: "RetryLimitExceeded",
          message: safeMessage("RetryLimitExceeded"),
          retryable: false,
        },
        conditions: [condition(resource, now, "False", "RetryLimitExceeded")],
      },
    });
    return;
  }

  const attempt = await beginAttempt(
    deps,
    resource,
    operation,
    ordinal,
    retryCount
  );
  if (!attempt) return;
  if (!(await deps.assertLeadership(attempt.leaderEpoch))) {
    await writeUnknown(deps, resource, "MutationOutcomeUnknown", attempt);
    return;
  }

  let allocated: ComputeWorkloadStatus["resource"] | undefined;
  let activeAttempt = attempt;
  try {
    const spec = toProvisionSpec(resource);
    const output =
      operation === "update"
        ? await deps.lifecycle.update({
            resourceId: resource.status?.resource?.id ?? "",
            environment: resource.spec.environment,
            spec,
            idempotencyKey: attempt.key,
          })
        : await deps.lifecycle.create({
            environment: resource.spec.environment,
            spec,
            idempotencyKey: attempt.key,
            onPrepared: async (allocationCursor) => {
              activeAttempt = {
                ...activeAttempt,
                outcome: "prepared",
                allocationCursor,
              };
              await patchReceipt(deps, resource, attemptReceipt(activeAttempt));
              await deps.state.patchStatus({
                resource,
                status: {
                  ...baseStatus(resource),
                  phase: "Progressing",
                  attempt: activeAttempt,
                  recoveryCount: resource.status?.recoveryCount ?? 0,
                  conditions: [
                    condition(
                      resource,
                      deps.now().toISOString(),
                      "False",
                      "CreateInProgress"
                    ),
                  ],
                },
              });
            },
            onAllocated: async (output) => {
              allocated = resourceStatus(output);
              const allocatedAttempt: ComputeWorkloadAttempt = {
                ...activeAttempt,
                outcome: "allocated",
              };
              activeAttempt = allocatedAttempt;
              await patchReceipt(
                deps,
                resource,
                attemptReceipt(allocatedAttempt, {
                  provider: output.provider,
                  id: output.leaseId,
                })
              );
              await deps.state.patchStatus({
                resource,
                status: {
                  ...baseStatus(resource),
                  phase: "Progressing",
                  resource: allocated,
                  attempt: allocatedAttempt,
                  recoveryCount: resource.status?.recoveryCount ?? 0,
                  conditions: [
                    condition(
                      resource,
                      deps.now().toISOString(),
                      "False",
                      "CreateInProgress"
                    ),
                  ],
                },
              });
            },
          });
    const completedAt = deps.now().toISOString();
    const completedAttempt: ComputeWorkloadAttempt = {
      ...activeAttempt,
      outcome: "succeeded",
      completedAt,
    };
    await patchReceipt(
      deps,
      resource,
      attemptReceipt(completedAttempt, {
        provider: output.provider,
        id: output.leaseId,
      })
    );
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        ...observedIdentity(resource),
        phase: "Progressing",
        observedGeneration: resource.metadata.generation,
        resource: resourceStatus(output),
        attempt: completedAttempt,
        recoveryCount:
          operation === "recover"
            ? ordinal
            : (resource.status?.recoveryCount ?? 0),
        conditions: [
          condition(
            resource,
            completedAt,
            "False",
            "ServingVerificationPending"
          ),
        ],
      },
    });
    await emit(
      deps,
      resource,
      "Normal",
      operation === "update" ? "Updated" : "Created"
    );
  } catch (error) {
    const failure = lifecycleError(error, true);
    const completedAt = deps.now().toISOString();
    const outcome =
      failure.kind === "unknown_outcome" ? "unknown" : "known_failure";
    const failedAttempt: ComputeWorkloadAttempt = {
      ...activeAttempt,
      outcome,
      completedAt,
    };
    await patchReceipt(
      deps,
      resource,
      attemptReceipt(
        failedAttempt,
        allocated
          ? { provider: allocated.provider, id: allocated.id }
          : undefined
      )
    );
    if (failure.kind === "unknown_outcome") {
      await writeUnknown(
        deps,
        resource,
        failure.reason,
        failedAttempt,
        allocated
      );
      return;
    }
    const terminal = !failure.retryable;
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: terminal ? "Failed" : "Progressing",
        ...(resource.status?.observedGeneration !== undefined
          ? { observedGeneration: resource.status.observedGeneration }
          : {}),
        ...(allocated
          ? { resource: allocated }
          : resource.status?.resource
            ? { resource: resource.status.resource }
            : {}),
        attempt: failedAttempt,
        recoveryCount: resource.status?.recoveryCount ?? 0,
        failure: {
          reason: failure.reason,
          message: safeMessage(failure.reason),
          retryable: failure.retryable,
        },
        conditions: [condition(resource, completedAt, "False", failure.reason)],
      },
    });
  }
}

async function closeKnown(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  current: NonNullable<ComputeWorkloadStatus["resource"]>
): Promise<boolean> {
  const attempt = await beginAttempt(
    deps,
    resource,
    "delete",
    resource.status?.recoveryCount ?? 0,
    0
  );
  if (!attempt) return false;
  if (!(await deps.assertLeadership(attempt.leaderEpoch))) {
    await writeUnknown(
      deps,
      resource,
      "MutationOutcomeUnknown",
      attempt,
      current
    );
    return false;
  }
  try {
    await deps.lifecycle.delete({ resourceId: current.id });
    const completed: ComputeWorkloadAttempt = {
      ...attempt,
      outcome: "succeeded",
      completedAt: deps.now().toISOString(),
    };
    await patchReceipt(
      deps,
      resource,
      attemptReceipt(completed, { provider: current.provider, id: current.id })
    );
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Progressing",
        resource: { ...current, state: "closed", endpoints: [] },
        attempt: completed,
        recoveryCount: resource.status?.recoveryCount ?? 0,
        conditions: [
          condition(
            resource,
            completed.completedAt ?? deps.now().toISOString(),
            "False",
            "ServingVerificationPending"
          ),
        ],
      },
    });
    return true;
  } catch (error) {
    const failure = lifecycleError(error, true);
    await writeUnknown(deps, resource, failure.reason, attempt, current);
    return false;
  }
}

async function finalize(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  current: ComputeWorkloadStatus["resource"] | undefined
): Promise<void> {
  const finalizers = resource.metadata.finalizers ?? [];
  if (!finalizers.includes(COMPUTE_WORKLOAD_FINALIZER)) return;
  if (!current) {
    if (resource.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]) {
      await writeUnknown(deps, resource, "OrphanRisk");
      return;
    }
  } else {
    try {
      const observed = await deps.lifecycle.observe({ resourceId: current.id });
      if (
        observed.state !== "closed" &&
        !(await closeKnown(deps, resource, current))
      )
        return;
    } catch (error) {
      const failure = lifecycleError(error, false);
      if (failure.kind !== "not_found") {
        await writeUnknown(
          deps,
          resource,
          "FinalizationBlocked",
          resource.status?.attempt,
          current
        );
        return;
      }
    }
  }
  await deps.state.patchMetadata({
    resource,
    finalizers: finalizers.filter(
      (value) => value !== COMPUTE_WORKLOAD_FINALIZER
    ),
  });
  await emit(deps, resource, "Normal", "Finalized");
}

async function observeAndReport(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  current: NonNullable<ComputeWorkloadStatus["resource"]>,
  attempt = resource.status?.attempt
): Promise<"active" | "pending" | "closed" | "missing" | "error"> {
  let observed: ProvisionOutput;
  try {
    observed = await deps.lifecycle.observe({ resourceId: current.id });
  } catch (error) {
    const failure = lifecycleError(error, false);
    if (failure.kind === "not_found") return "missing";
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase:
          failure.reason === "ProviderCredentialMissing"
            ? "Failed"
            : "Progressing",
        resource: current,
        ...(attempt ? { attempt } : {}),
        recoveryCount: resource.status?.recoveryCount ?? 0,
        failure: {
          reason: failure.reason,
          message: safeMessage(failure.reason),
          retryable: failure.retryable,
        },
        conditions: [condition(resource, now, "False", failure.reason)],
      },
    });
    return "error";
  }
  if (observed.state === "closed") return "closed";
  if (observed.state !== "active") return "pending";
  const verified = await deps.lifecycle.verifySource({
    endpoints: observed.endpoints,
    expectedSourceSha: resource.spec.bundle.source.sha,
  });
  const now = deps.now().toISOString();
  await deps.state.patchStatus({
    resource,
    status: {
      ...baseStatus(resource),
      ...observedIdentity(resource),
      phase: verified ? "Ready" : "Progressing",
      observedGeneration: resource.metadata.generation,
      resource: resourceStatus(observed),
      ...(attempt
        ? {
            attempt: verified
              ? { ...attempt, outcome: "succeeded", completedAt: now }
              : attempt,
          }
        : {}),
      recoveryCount: resource.status?.recoveryCount ?? 0,
      conditions: [
        condition(
          resource,
          now,
          verified ? "True" : "False",
          verified ? "SourceVerified" : "ServingVerificationPending"
        ),
      ],
    },
  });
  return "active";
}

function attemptFromReceipt(
  receipt: ComputeWorkloadAttemptReceipt
): ComputeWorkloadAttempt {
  return {
    key: receipt.key,
    operation: receipt.operation,
    ordinal: receipt.ordinal,
    outcome: receipt.outcome,
    retryCount: receipt.retryCount,
    leaderEpoch: receipt.leaderEpoch,
    ...(receipt.allocationCursor
      ? { allocationCursor: receipt.allocationCursor }
      : {}),
    startedAt: receipt.startedAt,
  };
}

async function recoverUncertainAllocation(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  receipt: ComputeWorkloadAttemptReceipt
): Promise<void> {
  if (!receipt.allocationCursor) {
    await writeUnknown(
      deps,
      resource,
      "OrphanRisk",
      attemptFromReceipt(receipt)
    );
    return;
  }
  let adopted: ProvisionOutput | null;
  try {
    adopted = await deps.lifecycle.recoverCreate({
      allocationCursor: receipt.allocationCursor,
    });
  } catch (error) {
    const failure = lifecycleError(error, false);
    await writeUnknown(
      deps,
      resource,
      failure.kind === "not_found" ? "ProviderOutcomeUnknown" : failure.reason,
      attemptFromReceipt(receipt)
    );
    return;
  }
  // Zero candidates cannot distinguish "POST never sent" from delayed provider commit.
  if (!adopted) {
    await writeUnknown(
      deps,
      resource,
      "ProviderOutcomeUnknown",
      attemptFromReceipt(receipt)
    );
    return;
  }
  const adoptedAttempt: ComputeWorkloadAttempt = {
    ...attemptFromReceipt(receipt),
    outcome: "allocated",
  };
  await patchReceipt(
    deps,
    resource,
    attemptReceipt(adoptedAttempt, {
      provider: adopted.provider,
      id: adopted.leaseId,
    })
  );
  await deps.state.patchStatus({
    resource,
    status: {
      ...baseStatus(resource),
      phase: "Progressing",
      resource: resourceStatus(adopted),
      attempt: adoptedAttempt,
      recoveryCount: resource.status?.recoveryCount ?? 0,
      conditions: [
        condition(
          resource,
          deps.now().toISOString(),
          "False",
          "CreateInProgress"
        ),
      ],
    },
  });
  if (adopted.state === "active") {
    await observeAndReport(
      deps,
      resource,
      resourceStatus(adopted),
      adoptedAttempt
    );
  }
  // Pending/closed adoption is handled from the durable handle on the next level pass.
}

export async function reconcileComputeWorkload(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload
): Promise<void> {
  const rawMarker =
    resource.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION];
  const receipt = decodeAttemptReceipt(rawMarker);
  const receiptResource = receipt?.resource
    ? {
        ...receipt.resource,
        state: "unknown" as const,
        endpoints: [] as string[],
      }
    : undefined;
  const current = resource.status?.resource ?? receiptResource;

  if (resource.metadata.deletionTimestamp) {
    await finalize(deps, resource, current);
    return;
  }
  if (ownershipFailure(resource, deps.environment)) {
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Failed",
        failure: {
          reason: "OwnershipMismatch",
          message: safeMessage("OwnershipMismatch"),
          retryable: false,
        },
        conditions: [condition(resource, now, "False", "OwnershipMismatch")],
      },
    });
    return;
  }

  const finalizers = resource.metadata.finalizers ?? [];
  if (!finalizers.includes(COMPUTE_WORKLOAD_FINALIZER)) {
    await deps.state.patchMetadata({
      resource,
      finalizers: [...finalizers, COMPUTE_WORKLOAD_FINALIZER],
    });
    return;
  }

  if (!current) {
    if (
      receipt &&
      (receipt.operation === "create" || receipt.operation === "recover") &&
      (receipt.outcome === "prepared" || receipt.outcome === "unknown")
    ) {
      await recoverUncertainAllocation(deps, resource, receipt);
      return;
    }
    if (
      receipt &&
      (receipt.operation === "create" || receipt.operation === "recover") &&
      receipt.outcome === "claimed" &&
      !receipt.allocationCursor
    ) {
      // The cursor is persisted before POST, so this state proves provider I/O did not start.
      await mutate(deps, resource, receipt.operation, receipt.ordinal);
      return;
    }
    if (rawMarker) {
      await writeUnknown(
        deps,
        resource,
        "OrphanRisk",
        resource.status?.attempt ??
          (receipt ? attemptFromReceipt(receipt) : undefined)
      );
      return;
    }
    await mutate(deps, resource, "create", 0);
    return;
  }

  const priorAttempt =
    resource.status?.attempt ??
    (receipt ? attemptFromReceipt(receipt) : undefined);
  if (
    !resource.status &&
    receipt?.resource &&
    receipt.outcome === "succeeded"
  ) {
    await observeAndReport(deps, resource, current, priorAttempt);
    return;
  }
  if (
    priorAttempt &&
    (priorAttempt.operation === "create" ||
      priorAttempt.operation === "recover") &&
    priorAttempt.outcome !== "succeeded"
  ) {
    const state = await observeAndReport(deps, resource, current, priorAttempt);
    if (state === "closed" || state === "missing") {
      await mutate(
        deps,
        resource,
        "recover",
        (resource.status?.recoveryCount ?? 0) + 1
      );
    } else if (state === "pending") {
      await closeKnown(deps, resource, current);
    }
    return;
  }

  if (resource.status?.observedGeneration !== resource.metadata.generation) {
    if (
      receipt?.operation === "update" &&
      (receipt.outcome === "claimed" || receipt.outcome === "unknown")
    ) {
      await writeUnknown(
        deps,
        resource,
        "MutationOutcomeUnknown",
        priorAttempt,
        current
      );
      return;
    }
    await mutate(deps, resource, "update", 0);
    return;
  }

  const state = await observeAndReport(deps, resource, current);
  if (state === "closed" || state === "missing") {
    await mutate(
      deps,
      resource,
      "recover",
      (resource.status?.recoveryCount ?? 0) + 1
    );
  }
}
