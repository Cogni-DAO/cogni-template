// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import type { ComputeResourcePort, ProvisionSpec } from "@cogni/ai-tools";
import { describe, expect, it, vi } from "vitest";

import { ComputeLifecycleError } from "@/ports";

import { AkashComputeError } from "./akash-compute.adapter";
import { ComputeWorkloadLifecycleAdapter } from "./compute-workload-lifecycle.adapter";

const SPEC: ProvisionSpec = {
  name: "sample-node",
  services: [
    {
      name: "app",
      image: `ghcr.io/cogni-dao/sample-node@sha256:${"a".repeat(64)}`,
      cpuUnits: 0.5,
      memoryMi: 512,
      storageMi: 1024,
    },
  ],
};

describe("ComputeWorkloadLifecycleAdapter", () => {
  it.each([
    ["status_unavailable", "BootStatusUnavailable", "transient", true],
    ["no_endpoint", "BootEndpointUnavailable", "transient", true],
    ["version_unavailable", "BootVersionUnavailable", "transient", true],
    ["source_mismatch", "BootSourceMismatch", "terminal", false],
    ["readiness_unavailable", "BootReadinessUnavailable", "terminal", false],
  ] as const)("maps boot stage %s to safe lifecycle reason %s", async (stage, reason, kind, retryable) => {
    const compute = {
      balances: async () => [],
      allocationCursor: vi.fn(async () => "41"),
      provisionWithAllocation: vi.fn(async () => {
        throw new AkashComputeError(
          "BOOT_SLO_TIMEOUT",
          "provider detail must not escape",
          undefined,
          stage
        );
      }),
    };
    const lifecycle = new ComputeWorkloadLifecycleAdapter(compute);

    await expect(
      lifecycle.create({
        environment: "candidate-a",
        spec: SPEC,
        expectedSourceSha: "a".repeat(40),
        idempotencyKey: "durable-key",
        onPrepared: async () => {},
        onAllocated: async () => {},
      })
    ).rejects.toMatchObject({ kind, reason, retryable });
  });

  it("maps an uncertain mutating transport failure to fail-closed unknown_outcome", async () => {
    const compute = {
      balances: async () => [],
      allocationCursor: vi.fn(async () => "41"),
      provisionWithAllocation: vi.fn(async () => {
        throw new AkashComputeError("TIMEOUT", "provider timeout");
      }),
    };
    const lifecycle = new ComputeWorkloadLifecycleAdapter(compute);

    const error = await lifecycle
      .create({
        environment: "candidate-a",
        spec: SPEC,
        expectedSourceSha: "a".repeat(40),
        idempotencyKey: "durable-key",
        onPrepared: async () => {},
        onAllocated: async () => {},
      })
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ComputeLifecycleError);
    expect(error).toMatchObject({
      kind: "unknown_outcome",
      reason: "ProviderOutcomeUnknown",
      retryable: false,
    });
  });

  it("maps provider 404 observation to not_found recovery input", async () => {
    const compute: ComputeResourcePort = {
      balances: async () => [],
      status: vi.fn(async () => {
        throw new AkashComputeError("HTTP_ERROR", "missing", 404);
      }),
    };
    const lifecycle = new ComputeWorkloadLifecycleAdapter(compute);

    await expect(lifecycle.observe({ resourceId: "42" })).rejects.toMatchObject(
      {
        kind: "not_found",
        retryable: false,
      }
    );
  });

  it("requires exact source identity and fixed /readyz health on the same endpoint", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ buildSha: "wrong" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ buildSha: "expected" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const lifecycle = new ComputeWorkloadLifecycleAdapter(
      { balances: async () => [] },
      fetchImpl
    );

    await expect(
      lifecycle.verifySource({
        endpoints: ["one.example", "https://two.example/"],
        expectedSourceSha: "expected",
      })
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "https://two.example/version",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      "https://two.example/readyz",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("does not report source verified while fixed /readyz is unhealthy", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ buildSha: "expected" }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const lifecycle = new ComputeWorkloadLifecycleAdapter(
      { balances: async () => [] },
      fetchImpl
    );

    await expect(
      lifecycle.verifySource({
        endpoints: ["https://one.example"],
        expectedSourceSha: "expected",
      })
    ).resolves.toBe(false);
  });

  it("serializes wallet allocations so each create gets a fresh pre-POST baseline", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    const allocationCursor = vi.fn(async () => String(40 + calls));
    const provisionWithAllocation = vi.fn(async (_input, onAllocated) => {
      calls++;
      if (calls === 1) await firstGate;
      const output = {
        provider: "akash",
        leaseId: String(41 + calls),
        state: "active" as const,
        endpoints: [],
      };
      await onAllocated(output);
      return output;
    });
    const lifecycle = new ComputeWorkloadLifecycleAdapter({
      balances: async () => [],
      allocationCursor,
      provisionWithAllocation,
    });
    const input = {
      environment: "candidate-a",
      spec: SPEC,
      expectedSourceSha: "a".repeat(40),
      idempotencyKey: "key",
      onPrepared: async () => {},
      onAllocated: async () => {},
    };
    const first = lifecycle.create(input);
    await vi.waitFor(() => expect(allocationCursor).toHaveBeenCalledTimes(1));
    const second = lifecycle.create({ ...input, idempotencyKey: "key-2" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(allocationCursor).toHaveBeenCalledTimes(1);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(allocationCursor).toHaveBeenCalledTimes(2);
    expect(provisionWithAllocation).toHaveBeenCalledTimes(2);
  });
});
