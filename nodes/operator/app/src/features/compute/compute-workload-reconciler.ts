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
import type { ComputeWorkloadDnsPort } from "@/ports/compute-workload-dns.port";
import {
  ComputeLifecycleError,
  type ComputeWorkloadLifecyclePort,
} from "@/ports/compute-workload-lifecycle.port";
import type { ComputeWorkloadSecretResolverPort } from "@/ports/compute-workload-secret-resolver.port";
import type { ComputeWorkloadStatePort } from "@/ports/compute-workload-state.port";
import { buildNodeAppIdentityEnv } from "./node-workload-spec";

const MAX_MUTATION_RETRIES = 3;

export interface ComputeWorkloadReconcileDeps {
  readonly lifecycle: ComputeWorkloadLifecyclePort;
  readonly state: ComputeWorkloadStatePort;
  readonly dns: ComputeWorkloadDnsPort;
  readonly secretResolver: ComputeWorkloadSecretResolverPort;
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
  SecretPolicyRejected:
    "declared runtime secret is not approved for external compute",
  SecretReferenceMissing:
    "declared runtime secret is not available in the node scope",
  DnsCredentialMissing: "external workload DNS credential is not configured",
  DnsReconcileFailed: "external workload DNS reconciliation did not succeed",
  DnsOwnershipChanged:
    "external workload DNS record no longer matches controller ownership",
  EndpointVerificationFailed: "workload source verification did not succeed",
  MutationClaimConflict: "another controller writer claimed this generation",
  WalletAllocationBlocked:
    "another uncertain wallet allocation must be resolved before creating more compute",
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

function baseStatus(resource: ComputeWorkload) {
  return {
    desiredGeneration: resource.metadata.generation,
    ...(resource.status?.dns ? { dns: resource.status.dns } : {}),
  };
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

function sharedSubstrateEnv(
  environment: string,
  secrets: Readonly<Record<string, string>>
): Record<string, string> {
  const databaseUrl = secrets.DATABASE_URL;
  if (!databaseUrl) return {};
  try {
    const host = new URL(databaseUrl).hostname;
    if (!host) return {};
    return {
      APP_ENV: "production",
      DEPLOY_ENVIRONMENT: environment,
      TEMPORAL_ADDRESS: `${host}:7233`,
      TEMPORAL_NAMESPACE: `cogni-${environment}`,
      TEMPORAL_TASK_QUEUE: "scheduler-tasks",
      REDIS_URL: `redis://${host}:6379`,
      LITELLM_BASE_URL: `http://${host}:4000`,
    };
  } catch {
    throw new ComputeLifecycleError(
      "terminal",
      "SecretReferenceMissing",
      false
    );
  }
}

const LEGACY_COGNI_APP_REQUIRED_ENV = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "DATABASE_SERVICE_URL",
  "DOLTGRES_URL",
  "LITELLM_MASTER_KEY",
] as const;

/** Explicit node-app compatibility policy; generic/private services do not inherit it. */
function legacyCogniAppEnv(input: {
  resource: ComputeWorkload;
  serviceName: string;
  visibility: "public" | "private";
  bindings: Readonly<Record<string, string>>;
  secrets: Readonly<Record<string, string>>;
}): Record<string, string> {
  if (input.serviceName !== "app" || input.visibility !== "public") {
    return { ...input.bindings, ...input.secrets };
  }
  if (LEGACY_COGNI_APP_REQUIRED_ENV.some((key) => !input.secrets[key])) {
    throw new ComputeLifecycleError(
      "terminal",
      "SecretReferenceMissing",
      false
    );
  }
  return buildNodeAppIdentityEnv({
    slug: input.resource.spec.workload.name,
    publicUrl: `https://${input.resource.spec.workload.publicHost}`,
    env: {
      APP_ENV: "production",
      DEPLOY_ENVIRONMENT: input.resource.spec.environment,
      COGNI_REPO_SHA: input.resource.spec.bundle.source.sha,
      ...sharedSubstrateEnv(input.resource.spec.environment, input.secrets),
      ...input.bindings,
      ...input.secrets,
    },
  });
}

async function toProvisionSpec(
  deps: ComputeWorkloadReconcileDeps,
  resource: ComputeWorkload
): Promise<ProvisionSpec> {
  const artifacts = new Map(
    resource.spec.bundle.artifacts.map((artifact) => [
      artifact.name,
      artifact.image,
    ])
  );
  const servicePorts = new Map(
    resource.spec.workload.services.map((service) => [
      service.name,
      service.port,
    ])
  );
  const sourceSlug = resource.spec.bundle.source.repository.split("/")[1];
  if (!sourceSlug || sourceSlug !== resource.spec.workload.name) {
    throw new ComputeLifecycleError("terminal", "ProviderRejected", false);
  }
  const services = await Promise.all(
    resource.spec.workload.services.map(async (service) => {
      const image = artifacts.get(service.artifact);
      if (!image) {
        throw new ComputeLifecycleError("terminal", "ProviderRejected", false);
      }
      const secrets = await deps.secretResolver.resolve({
        nodeId: resource.spec.nodeId,
        nodeSlug: sourceSlug,
        environment: resource.spec.environment,
        serviceName: service.name,
        sourceSha: resource.spec.bundle.source.sha,
        refs: service.secretRefs ?? [],
      });
      const bindingEnv = Object.fromEntries(
        Object.entries(service.bindings).map(([envName, target]) => [
          envName,
          `http://${target}:${servicePorts.get(target) ?? 0}`,
        ])
      );
      const runtimeEnv = legacyCogniAppEnv({
        resource,
        serviceName: service.name,
        visibility: service.visibility,
        bindings: bindingEnv,
        secrets,
      });
      return {
        name: service.name,
        image,
        env: {
          HOST: service.bindHost,
          HOSTNAME: service.bindHost,
          PORT: String(service.port),
          ...runtimeEnv,
        },
        ...(service.command ? { command: service.command } : {}),
        ...(service.args ? { args: service.args } : {}),
        cpuUnits: service.cpuUnits,
        memoryMi: service.memoryMi,
        storageMi: service.storageMi,
        expose: [
          {
            port: service.port,
            as: service.visibility === "public" ? 80 : service.port,
            global: service.visibility === "public",
            ...(service.visibility === "public"
              ? { hosts: [resource.spec.workload.publicHost] }
              : {}),
          },
        ],
      };
    })
  );
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
  const walletMutation = operation !== "update";
  if (walletMutation) {
    const wallet = await deps.state.claimWalletAllocation({
      attemptKey: attempt.key,
      workloadUid: resource.metadata.uid,
    });
    if (wallet.state === "blocked") {
      const now = deps.now().toISOString();
      await deps.state.patchStatus({
        resource,
        status: {
          ...baseStatus(resource),
          phase: "Progressing",
          attempt,
          recoveryCount: resource.status?.recoveryCount ?? 0,
          failure: {
            reason: "WalletAllocationBlocked",
            message: safeMessage("WalletAllocationBlocked"),
            retryable: true,
          },
          conditions: [
            condition(resource, now, "False", "WalletAllocationBlocked"),
          ],
        },
      });
      return;
    }
    if (wallet.allocationCursor) {
      activeAttempt = {
        ...activeAttempt,
        outcome: "prepared",
        allocationCursor: wallet.allocationCursor,
      };
      await patchReceipt(deps, resource, attemptReceipt(activeAttempt));
      await recoverUncertainAllocation(
        deps,
        resource,
        attemptReceipt(activeAttempt)
      );
      return;
    }
  }
  try {
    const spec = await toProvisionSpec(deps, resource);
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
              await deps.state.prepareWalletAllocation({
                attemptKey: activeAttempt.key,
                allocationCursor,
              });
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
              await deps.state.completeWalletAllocation({
                attemptKey: allocatedAttempt.key,
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
    if (walletMutation) {
      await deps.state.completeWalletAllocation({
        attemptKey: completedAttempt.key,
      });
    }
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
    if (walletMutation) {
      await deps.state.completeWalletAllocation({
        attemptKey: failedAttempt.key,
      });
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
  if (resource.status?.dns) {
    try {
      await deps.dns.deleteOwned({
        hostname: resource.status.dns.hostname,
        expectedTarget: resource.status.dns.target,
      });
    } catch (error) {
      const failure = lifecycleError(error, false);
      await writeUnknown(
        deps,
        resource,
        failure.reason === "DnsOwnershipChanged"
          ? failure.reason
          : "FinalizationBlocked",
        resource.status?.attempt,
        current
      );
      return;
    }
  }
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
  let dnsTarget: string | undefined;
  try {
    dnsTarget = endpointHostname(observed.endpoints);
    // Persist exact cleanup ownership before the DNS write. A crash can leave a
    // record behind, but never an untracked record the finalizer would ignore.
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        ...observedIdentity(resource),
        phase: "Progressing",
        observedGeneration: resource.metadata.generation,
        resource: resourceStatus(observed),
        ...(dnsTarget
          ? {
              dns: {
                hostname: resource.spec.workload.publicHost,
                target: dnsTarget,
              },
            }
          : {}),
        ...(attempt ? { attempt } : {}),
        recoveryCount: resource.status?.recoveryCount ?? 0,
        conditions: [
          condition(
            resource,
            deps.now().toISOString(),
            "False",
            "ServingVerificationPending"
          ),
        ],
      },
    });
    await deps.dns.reconcile({
      hostname: resource.spec.workload.publicHost,
      target: dnsTarget,
    });
  } catch (error) {
    const failure = lifecycleError(error, false);
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        ...observedIdentity(resource),
        phase: failure.retryable ? "Progressing" : "Failed",
        observedGeneration: resource.metadata.generation,
        resource: resourceStatus(observed),
        ...(dnsTarget
          ? {
              dns: {
                hostname: resource.spec.workload.publicHost,
                target: dnsTarget,
              },
            }
          : {}),
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
  if (!dnsTarget) return "error";
  const verified = await deps.lifecycle.verifySource({
    endpoints: [`https://${resource.spec.workload.publicHost}`],
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
      dns: {
        hostname: resource.spec.workload.publicHost,
        target: dnsTarget,
      },
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

function endpointHostname(endpoints: readonly string[]): string {
  for (const endpoint of endpoints) {
    try {
      const value = endpoint.includes("://") ? endpoint : `http://${endpoint}`;
      const hostname = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
      if (hostname && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname))
        return hostname;
    } catch {
      // Try the next provider-reported endpoint.
    }
  }
  throw new ComputeLifecycleError("transient", "DnsReconcileFailed", true);
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
  const wallet = await deps.state.claimWalletAllocation({
    attemptKey: receipt.key,
    workloadUid: resource.metadata.uid,
  });
  if (wallet.state === "blocked") {
    const attempt = attemptFromReceipt(receipt);
    const now = deps.now().toISOString();
    await deps.state.patchStatus({
      resource,
      status: {
        ...baseStatus(resource),
        phase: "Progressing",
        attempt,
        recoveryCount: resource.status?.recoveryCount ?? 0,
        failure: {
          reason: "WalletAllocationBlocked",
          message: safeMessage("WalletAllocationBlocked"),
          retryable: true,
        },
        conditions: [
          condition(resource, now, "False", "WalletAllocationBlocked"),
        ],
      },
    });
    return;
  }
  if (
    wallet.allocationCursor &&
    wallet.allocationCursor !== receipt.allocationCursor
  ) {
    await writeUnknown(
      deps,
      resource,
      "ProviderOutcomeUnknown",
      attemptFromReceipt(receipt)
    );
    return;
  }
  if (!wallet.allocationCursor) {
    await deps.state.prepareWalletAllocation({
      attemptKey: receipt.key,
      allocationCursor: receipt.allocationCursor,
    });
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
  await deps.state.completeWalletAllocation({ attemptKey: adoptedAttempt.key });
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
  if (current && receipt?.resource) {
    // Handle persistence is the wallet-wide commit point. Clear a stale slot left by a
    // crash after the per-resource receipt but before ledger completion.
    await deps.state.completeWalletAllocation({ attemptKey: receipt.key });
  }

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
