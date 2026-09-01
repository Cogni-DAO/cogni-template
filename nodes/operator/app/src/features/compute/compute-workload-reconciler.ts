// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/** Level-based reconciliation for one provider-neutral ComputeWorkload resource. */

import {
  COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION,
  COMPUTE_WORKLOAD_FINALIZER,
  type ComputeWorkload,
  type ComputeWorkloadAttempt,
  type ComputeWorkloadStatus,
  computeWorkloadIdempotencyKey,
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
  readonly now: () => Date;
}

function condition(
  resource: ComputeWorkload,
  now: string,
  status: "True" | "False" | "Unknown",
  reason: string,
  message: string
) {
  return {
    type: "Ready" as const,
    status,
    observedGeneration: resource.metadata.generation,
    reason,
    message,
    lastTransitionTime: now,
  };
}

function baseStatus(
  resource: ComputeWorkload
): Pick<
  ComputeWorkloadStatus,
  "desiredGeneration" | "sourceSha" | "artifactDigests"
> {
  return {
    desiredGeneration: resource.metadata.generation,
    sourceSha: resource.spec.sourceSha,
    artifactDigests: resource.spec.artifactDigests,
  };
}

async function emit(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  type: "Normal" | "Warning",
  reason: string,
  message: string
): Promise<void> {
  await deps.state.event({ resource, type, reason, message }).catch(() => {});
}

async function writeUnknown(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  reason: string,
  message: string,
  attempt?: ComputeWorkloadAttempt
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
      ...(resource.status?.resource
        ? { resource: resource.status.resource }
        : {}),
      ...(attempt ? { attempt } : {}),
      recoveryCount: resource.status?.recoveryCount ?? 0,
      failure: { reason, message, retryable: false },
      conditions: [condition(resource, now, "Unknown", reason, message)],
    },
  });
  await emit(deps, resource, "Warning", reason, message);
}

function ownershipFailure(
  resource: ComputeWorkload,
  environment: string
): string | null {
  const labels = resource.metadata.labels ?? {};
  if (resource.spec.environment !== environment) {
    return `spec.environment ${resource.spec.environment} is not controller environment ${environment}`;
  }
  if (labels["cogni.io/environment"] !== resource.spec.environment) {
    return "cogni.io/environment label must equal spec.environment";
  }
  if (labels["cogni.io/node-id"] !== resource.spec.nodeId) {
    return "cogni.io/node-id label must equal spec.nodeId";
  }
  return null;
}

async function finalize(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload
): Promise<void> {
  const finalizers = resource.metadata.finalizers ?? [];
  if (!finalizers.includes(COMPUTE_WORKLOAD_FINALIZER)) return;
  const handle = resource.status?.resource?.id;
  if (!handle) {
    if (resource.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]) {
      await writeUnknown(
        deps,
        resource,
        "OrphanRisk",
        "external mutation was attempted but the durable resource handle is missing; finalization is blocked"
      );
      return;
    }
  } else {
    try {
      await deps.lifecycle.delete({ resourceId: handle });
    } catch (error) {
      const message = error instanceof Error ? error.message : "delete failed";
      await writeUnknown(deps, resource, "FinalizationBlocked", message);
      return;
    }
  }
  await deps.state.patchMetadata({
    resource,
    finalizers: finalizers.filter(
      (value) => value !== COMPUTE_WORKLOAD_FINALIZER
    ),
  });
  await emit(
    deps,
    resource,
    "Normal",
    "Finalized",
    "external resource released"
  );
}

async function beginAttempt(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  operation: ComputeWorkloadAttempt["operation"],
  ordinal: number,
  retryCount: number
): Promise<ComputeWorkloadAttempt> {
  const key = computeWorkloadIdempotencyKey({ resource, operation, ordinal });
  const attempt: ComputeWorkloadAttempt = {
    key,
    operation,
    ordinal,
    outcome: "in_progress",
    retryCount,
    startedAt: deps.now().toISOString(),
  };
  // Metadata survives status loss. It is intentionally persisted before provider IO.
  await deps.state.patchMetadata({
    resource,
    annotations: { [COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION]: key },
  });
  await deps.state.patchStatus({
    resource,
    status: {
      ...baseStatus(resource),
      phase: "Progressing",
      ...(resource.status?.observedGeneration !== undefined
        ? { observedGeneration: resource.status.observedGeneration }
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
          `${operation[0]?.toUpperCase()}${operation.slice(1)}InProgress`,
          `${operation} attempt ${ordinal} is in progress`
        ),
      ],
    },
  });
  return attempt;
}

async function mutate(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload,
  operation: ComputeWorkloadAttempt["operation"],
  ordinal: number
): Promise<void> {
  const previous = resource.status?.attempt;
  const key = computeWorkloadIdempotencyKey({ resource, operation, ordinal });
  if (
    previous?.key === key &&
    previous.outcome === "known_failure" &&
    resource.status?.failure?.retryable === false
  ) {
    return;
  }
  const retryCount = previous?.key === key ? previous.retryCount + 1 : 0;
  if (retryCount >= MAX_MUTATION_RETRIES) {
    const message = `${operation} exhausted ${MAX_MUTATION_RETRIES} known-outcome attempts`;
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Failed",
        ...(resource.status?.observedGeneration !== undefined
          ? { observedGeneration: resource.status.observedGeneration }
          : {}),
        ...(resource.status?.resource
          ? { resource: resource.status.resource }
          : {}),
        ...(previous ? { attempt: previous } : {}),
        recoveryCount: resource.status?.recoveryCount ?? 0,
        failure: { reason: "RetryLimitExceeded", message, retryable: false },
        conditions: [
          condition(resource, now, "False", "RetryLimitExceeded", message),
        ],
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
  try {
    const output =
      operation === "update"
        ? await deps.lifecycle.update({
            resourceId: resource.status?.resource?.id ?? "",
            environment: resource.spec.environment,
            spec: resource.spec.workload,
            idempotencyKey: attempt.key,
          })
        : await deps.lifecycle.create({
            environment: resource.spec.environment,
            spec: resource.spec.workload,
            idempotencyKey: attempt.key,
          });
    const completedAt = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Progressing",
        observedGeneration: resource.metadata.generation,
        resource: {
          provider: output.provider,
          id: output.leaseId,
          state: output.state,
          endpoints: output.endpoints,
        },
        attempt: { ...attempt, outcome: "succeeded", completedAt },
        recoveryCount:
          operation === "recover"
            ? ordinal
            : (resource.status?.recoveryCount ?? 0),
        conditions: [
          condition(
            resource,
            completedAt,
            "False",
            "ServingVerificationPending",
            "external state converged; waiting for exact source SHA"
          ),
        ],
      },
    });
    await emit(
      deps,
      resource,
      "Normal",
      operation === "update" ? "Updated" : "Created",
      `external resource ${output.leaseId} reconciled`
    );
  } catch (error) {
    const lifecycleError =
      error instanceof ComputeLifecycleError
        ? error
        : new ComputeLifecycleError(
            "unknown_outcome",
            error instanceof Error ? error.message : "provider mutation failed",
            false
          );
    const completedAt = deps.now().toISOString();
    if (lifecycleError.kind === "unknown_outcome") {
      await writeUnknown(
        deps,
        resource,
        "MutationOutcomeUnknown",
        lifecycleError.message,
        {
          ...attempt,
          outcome: "unknown",
          completedAt,
        }
      );
      return;
    }
    const failedAttempt: ComputeWorkloadAttempt = {
      ...attempt,
      outcome: "known_failure",
      completedAt,
    };
    const terminal = !lifecycleError.retryable;
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: terminal ? "Failed" : "Progressing",
        ...(resource.status?.observedGeneration !== undefined
          ? { observedGeneration: resource.status.observedGeneration }
          : {}),
        ...(resource.status?.resource
          ? { resource: resource.status.resource }
          : {}),
        attempt: failedAttempt,
        recoveryCount: resource.status?.recoveryCount ?? 0,
        failure: {
          reason: terminal ? "TerminalProviderError" : "TransientProviderError",
          message: lifecycleError.message,
          retryable: lifecycleError.retryable,
        },
        conditions: [
          condition(
            resource,
            completedAt,
            "False",
            terminal ? "TerminalProviderError" : "RetryScheduled",
            lifecycleError.message
          ),
        ],
      },
    });
  }
}

async function recover(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload
): Promise<void> {
  const ordinal = (resource.status?.recoveryCount ?? 0) + 1;
  const key = computeWorkloadIdempotencyKey({
    resource,
    operation: "recover",
    ordinal,
  });
  const attempt = resource.status?.attempt;
  const marker =
    resource.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION];
  if (
    marker === key &&
    attempt?.key === key &&
    (attempt.outcome === "in_progress" || attempt.outcome === "unknown")
  ) {
    await writeUnknown(
      deps,
      resource,
      "MutationOutcomeUnknown",
      "the recovery create may have reached the provider; automatic replay is blocked",
      attempt
    );
    return;
  }
  await mutate(deps, resource, "recover", ordinal);
}

export async function reconcileComputeWorkload(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload
): Promise<void> {
  if (resource.metadata.deletionTimestamp) {
    await finalize(deps, resource);
    return;
  }

  const ownershipError = ownershipFailure(resource, deps.environment);
  if (ownershipError) {
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Failed",
        failure: {
          reason: "OwnershipMismatch",
          message: ownershipError,
          retryable: false,
        },
        conditions: [
          condition(
            resource,
            now,
            "False",
            "OwnershipMismatch",
            ownershipError
          ),
        ],
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

  const current = resource.status?.resource;
  const recordedAttempt = resource.status?.attempt;
  const marker =
    resource.metadata.annotations?.[COMPUTE_WORKLOAD_ATTEMPT_ANNOTATION];
  if (!current) {
    if (
      marker &&
      (!recordedAttempt ||
        recordedAttempt.outcome === "in_progress" ||
        recordedAttempt.outcome === "unknown" ||
        recordedAttempt.outcome === "succeeded")
    ) {
      await writeUnknown(
        deps,
        resource,
        "OrphanRisk",
        "an external mutation marker exists without a durable resource handle; refusing duplicate create",
        recordedAttempt
      );
      return;
    }
    await mutate(deps, resource, "create", 0);
    return;
  }

  if (resource.status?.observedGeneration !== resource.metadata.generation) {
    const updateKey = computeWorkloadIdempotencyKey({
      resource,
      operation: "update",
      ordinal: 0,
    });
    if (
      marker === updateKey &&
      recordedAttempt?.key === updateKey &&
      (recordedAttempt.outcome === "in_progress" ||
        recordedAttempt.outcome === "unknown")
    ) {
      await writeUnknown(
        deps,
        resource,
        "MutationOutcomeUnknown",
        "the generation update may have reached the provider; automatic replay is blocked",
        recordedAttempt
      );
      return;
    }
    await mutate(deps, resource, "update", 0);
    return;
  }

  let observed: Awaited<ReturnType<ComputeWorkloadLifecyclePort["observe"]>>;
  try {
    observed = await deps.lifecycle.observe({ resourceId: current.id });
  } catch (error) {
    if (error instanceof ComputeLifecycleError && error.kind === "not_found") {
      await recover(deps, resource);
      return;
    }
    const message = error instanceof Error ? error.message : "observe failed";
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Progressing",
        observedGeneration: resource.metadata.generation,
        resource: current,
        ...(recordedAttempt ? { attempt: recordedAttempt } : {}),
        recoveryCount: resource.status?.recoveryCount ?? 0,
        failure: { reason: "ObserveFailed", message, retryable: true },
        conditions: [
          condition(resource, now, "False", "ObserveFailed", message),
        ],
      },
    });
    return;
  }

  if (observed.state === "closed") {
    await recover(deps, resource);
    return;
  }

  const verified =
    observed.state === "active" &&
    (await deps.lifecycle.verifySource({
      endpoints: observed.endpoints,
      expectedSourceSha: resource.spec.sourceSha,
    }));
  const now = deps.now().toISOString();
  await deps.state.patchStatus({
    resource,
    status: {
      ...baseStatus(resource),
      phase: verified ? "Ready" : "Progressing",
      observedGeneration: resource.metadata.generation,
      resource: {
        provider: observed.provider,
        id: observed.leaseId,
        state: observed.state,
        endpoints: observed.endpoints,
      },
      ...(recordedAttempt ? { attempt: recordedAttempt } : {}),
      recoveryCount: resource.status?.recoveryCount ?? 0,
      conditions: [
        condition(
          resource,
          now,
          verified ? "True" : "False",
          verified ? "SourceVerified" : "ServingVerificationPending",
          verified
            ? `serving expected source SHA ${resource.spec.sourceSha}`
            : `waiting for /version.buildSha ${resource.spec.sourceSha}`
        ),
      ],
    },
  });
}
