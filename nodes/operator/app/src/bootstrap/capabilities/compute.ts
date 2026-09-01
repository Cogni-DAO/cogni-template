// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/capabilities/compute`
 * Purpose: Factory for ComputeResourcePort — composes the configured provider adapters
 *   (Cherry balance read, Akash Console read+write) behind one provider-blind port.
 * Scope: Creates ComputeResourcePort from ServerEnv. Does not implement transport.
 * Invariants:
 *   - NO_SECRETS_IN_CONTEXT: CHERRY_AUTH_TOKEN / AKASH_CONSOLE_API_KEY resolved from env here,
 *     never passed to tools.
 *   - CAPABILITY_INJECTION: constructed at bootstrap, injected via the container.
 *   - GRACEFUL_DEGRADATION: unconfigured → empty-balance stub (build stays green; the awareness
 *     surface simply observes zero accounts) until the tokens reach the operator runtime via ESO.
 *   - EVERY_PROVIDER_REPORTS: balances() concatenates every configured adapter's read (fail-loud
 *     per FAIL_LOUD — one provider failing fails the read so a dead balance monitor is visible).
 *     The write half delegates to the single workload-capable adapter (Akash, task.5044).
 * Side-effects: none (factory only)
 * Links: AkashComputeAdapter + CherryComputeAdapter (@/adapters/server),
 *   ComputeResourcePort (@cogni/ai-tools).
 * @internal
 */

import type { ComputeResourcePort } from "@cogni/ai-tools";

import { AkashComputeAdapter, CherryComputeAdapter } from "@/adapters/server";
import type { ServerEnv } from "@/shared/env";

/**
 * Stub ComputeResourcePort used when no provider is configured.
 * Returns no balances rather than throwing — a missing token is a not-yet-wired
 * runtime secret, not a caller error; the emitter just reports zero accounts.
 */
export const stubComputeCapability: ComputeResourcePort = {
  balances: async () => [],
};

/**
 * Create ComputeResourcePort from server environment.
 *
 * - CHERRY_AUTH_TOKEN set: Cherry billing read included.
 * - AKASH_CONSOLE_API_KEY set: Akash Console read + workload write half included.
 * - Neither: empty-balance stub (graceful degradation).
 */
export function createComputeCapability(env: ServerEnv): ComputeResourcePort {
  const adapters: ComputeResourcePort[] = [];
  if (env.CHERRY_AUTH_TOKEN) {
    adapters.push(
      new CherryComputeAdapter({
        authToken: env.CHERRY_AUTH_TOKEN,
        timeoutMs: env.COMPUTE_BALANCE_QUERY_TIMEOUT_MS,
      })
    );
  }
  if (env.AKASH_CONSOLE_API_KEY) {
    const preferredProviders = (env.AKASH_PREFERRED_PROVIDERS ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    adapters.push(
      new AkashComputeAdapter({
        apiKey: env.AKASH_CONSOLE_API_KEY,
        timeoutMs: env.COMPUTE_BALANCE_QUERY_TIMEOUT_MS,
        ...(preferredProviders.length > 0 ? { preferredProviders } : {}),
      })
    );
  }
  if (adapters.length === 0) return stubComputeCapability;
  const first = adapters[0];
  if (adapters.length === 1 && first) return first;

  const writer = adapters.find((a) => a.provision);
  return {
    balances: async () =>
      (await Promise.all(adapters.map((a) => a.balances()))).flat(),
    ...(writer?.provision ? { provision: writer.provision.bind(writer) } : {}),
    ...(writer?.status ? { status: writer.status.bind(writer) } : {}),
    ...(writer?.release ? { release: writer.release.bind(writer) } : {}),
  };
}
