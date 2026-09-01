// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import type {
  ComputeResourcePort,
  ProvisionOutput,
  ProvisionSpec,
} from "@cogni/ai-tools";

import {
  ComputeLifecycleError,
  type ComputeWorkloadLifecyclePort,
} from "@/ports/compute-workload-lifecycle.port";

import { AkashComputeError } from "./akash-compute.adapter";

interface UpdatableComputeResourcePort extends ComputeResourcePort {
  update?(input: {
    resourceId: string;
    env: string;
    spec: ProvisionSpec;
    idempotencyKey: string;
  }): Promise<ProvisionOutput>;
}

function mapError(error: unknown, mutating: boolean): ComputeLifecycleError {
  if (error instanceof ComputeLifecycleError) return error;
  if (error instanceof AkashComputeError) {
    if (error.code === "HTTP_ERROR" && error.httpStatus === 404) {
      return new ComputeLifecycleError("not_found", error.message, false);
    }
    if (error.code === "TIMEOUT" || error.code === "NETWORK_ERROR") {
      return new ComputeLifecycleError(
        mutating ? "unknown_outcome" : "transient",
        error.message,
        !mutating
      );
    }
    const retryable =
      error.code === "NO_BIDS" || error.code === "NO_ELIGIBLE_BIDS";
    return new ComputeLifecycleError(
      retryable ? "transient" : "terminal",
      error.message,
      retryable
    );
  }
  return new ComputeLifecycleError(
    mutating ? "unknown_outcome" : "transient",
    error instanceof Error
      ? error.message
      : "compute provider operation failed",
    !mutating
  );
}

/** Adapts the existing compute capability into the controller's lifecycle contract. */
export class ComputeWorkloadLifecycleAdapter
  implements ComputeWorkloadLifecyclePort
{
  constructor(
    private readonly compute: UpdatableComputeResourcePort,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async observe(input: { resourceId: string }): Promise<ProvisionOutput> {
    if (!this.compute.status) {
      throw new ComputeLifecycleError(
        "terminal",
        "compute provider does not support observe",
        false
      );
    }
    try {
      return await this.compute.status({ leaseId: input.resourceId });
    } catch (error) {
      throw mapError(error, false);
    }
  }

  async create(input: {
    environment: string;
    spec: ProvisionSpec;
    idempotencyKey: string;
  }): Promise<ProvisionOutput> {
    if (!this.compute.provision) {
      throw new ComputeLifecycleError(
        "terminal",
        "compute provider does not support create",
        false
      );
    }
    try {
      void input.idempotencyKey;
      return await this.compute.provision({
        env: input.environment,
        spec: input.spec,
      });
    } catch (error) {
      throw mapError(error, true);
    }
  }

  async update(input: {
    resourceId: string;
    environment: string;
    spec: ProvisionSpec;
    idempotencyKey: string;
  }): Promise<ProvisionOutput> {
    if (!this.compute.update) {
      throw new ComputeLifecycleError(
        "terminal",
        "compute provider does not support in-place update",
        false
      );
    }
    try {
      return await this.compute.update({
        resourceId: input.resourceId,
        env: input.environment,
        spec: input.spec,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      throw mapError(error, true);
    }
  }

  async delete(input: { resourceId: string }): Promise<void> {
    if (!this.compute.release) {
      throw new ComputeLifecycleError(
        "terminal",
        "compute provider does not support delete",
        false
      );
    }
    try {
      await this.compute.release({ leaseId: input.resourceId });
    } catch (error) {
      const mapped = mapError(error, true);
      if (mapped.kind !== "not_found") throw mapped;
    }
  }

  async verifySource(input: {
    endpoints: readonly string[];
    expectedSourceSha: string;
  }): Promise<boolean> {
    for (const endpoint of input.endpoints) {
      const base = endpoint.startsWith("http")
        ? endpoint
        : `http://${endpoint}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const response = await this.fetchImpl(
          `${base.replace(/\/$/, "")}/version`,
          { signal: controller.signal }
        );
        if (!response.ok) continue;
        const version = (await response.json()) as { buildSha?: unknown };
        if (version.buildSha === input.expectedSourceSha) return true;
      } catch {
        // A probe is recomputable observed state; the next reconcile retries.
      } finally {
        clearTimeout(timeout);
      }
    }
    return false;
  }
}
