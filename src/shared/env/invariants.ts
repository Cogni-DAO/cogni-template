// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/invariants`
 * Purpose: Fail-fast validation of cross-field env invariants beyond Zod schema.
 * Scope: Runtime assertions for config combinations that Zod refine() can't express cleanly. Does NOT handle Zod schema definition.
 * Invariants: Throws on invalid combinations; called after Zod parse succeeds.
 * Side-effects: none
 * Notes: MVP uses service-auth only (LITELLM_MASTER_KEY). When real per-user API keys are introduced, add validation here.
 * Links: src/shared/env/server.ts
 * @public
 */

/**
 * Minimal type for env invariant validation.
 * Kept inline to avoid circular imports with server.ts
 */
interface ParsedEnv {
  APP_ENV: "test" | "production";
  LITELLM_MASTER_KEY?: string | undefined;
}

/**
 * Asserts cross-field environment invariants that Zod can't express cleanly.
 * Called after Zod schema validation passes.
 *
 * MVP: Service-auth only - all LLM calls use LITELLM_MASTER_KEY from env.
 *
 * @throws Error if invariants are violated
 */
export function assertEnvInvariants(env: ParsedEnv): void {
  // MVP: Service-auth requires LITELLM_MASTER_KEY (except in test mode with fakes)
  if (
    env.APP_ENV === "production" &&
    (!env.LITELLM_MASTER_KEY || env.LITELLM_MASTER_KEY.trim() === "")
  ) {
    throw new Error(
      "APP_ENV=production requires non-empty LITELLM_MASTER_KEY (service-auth mode)"
    );
  }
}
