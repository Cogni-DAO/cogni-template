// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

type JsonRecord = Readonly<Record<string, unknown>>;

export type ComputeWorkloadReadiness =
  | { readonly ready: true }
  | { readonly ready: false; readonly reason: string };

/** Compare live controller state with the exact Git-rendered desired state. */
export function assessComputeWorkloadReadiness(input: {
  readonly expected: unknown;
  readonly live: unknown;
}): ComputeWorkloadReadiness {
  const expected = asRecord(input.expected);
  const live = asRecord(input.live);
  const expectedMetadata = asRecord(expected?.metadata);
  const liveMetadata = asRecord(live?.metadata);
  const expectedSpec = asRecord(expected?.spec);
  const liveSpec = asRecord(live?.spec);
  const expectedBundle = asRecord(expectedSpec?.bundle);
  const status = asRecord(live?.status);

  if (
    !expected ||
    !live ||
    expected.apiVersion !== "compute.cogni.io/v1alpha1" ||
    live.apiVersion !== expected.apiVersion ||
    expected.kind !== "ComputeWorkload" ||
    live.kind !== expected.kind ||
    !expectedMetadata ||
    !liveMetadata ||
    !expectedSpec ||
    !liveSpec ||
    !expectedBundle
  ) {
    return { ready: false, reason: "invalid_resource_shape" };
  }
  if (
    liveMetadata.name !== expectedMetadata.name ||
    liveMetadata.namespace !== expectedMetadata.namespace
  ) {
    return { ready: false, reason: "identity_mismatch" };
  }
  if (stableJson(liveSpec) !== stableJson(expectedSpec)) {
    return { ready: false, reason: "desired_spec_pending" };
  }

  const generation = liveMetadata.generation;
  if (!Number.isInteger(generation) || Number(generation) < 1) {
    return { ready: false, reason: "invalid_generation" };
  }
  if (!status || status.observedGeneration !== generation) {
    return { ready: false, reason: "generation_pending" };
  }
  if (status.phase !== "Ready") {
    return { ready: false, reason: "phase_not_ready" };
  }
  if (stableJson(status.observedBundle) !== stableJson(expectedBundle)) {
    return { ready: false, reason: "bundle_not_observed" };
  }

  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const ready = conditions.some((value) => {
    const condition = asRecord(value);
    return (
      condition?.type === "Ready" &&
      condition.status === "True" &&
      condition.observedGeneration === generation
    );
  });
  return ready
    ? { ready: true }
    : { ready: false, reason: "ready_condition_pending" };
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  const record = asRecord(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.entries(record)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)])
  );
}
