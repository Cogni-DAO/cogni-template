// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/invariants`
 * Purpose: Fail-fast validation of runtime secrets and cross-field env invariants beyond Zod schema.
 * Scope: Runtime secret checks (adapter boundaries only) and cross-field validations. Does NOT validate during Next.js build/SSG.
 * Invariants: Throws RuntimeSecretError on missing secrets; memoizes production only; never runs at module init.
 * Side-effects: none
 * Notes: Call assertRuntimeSecrets() from adapter methods and runtime endpoints only, never from build-reachable code.
 * Links: src/shared/env/server.ts, src/adapters/server/ai/litellm.adapter.ts, src/app/(infra)/readyz/route.ts
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
 * @throws Error if invariants are violated
 */
export function assertEnvInvariants(_env: ParsedEnv): void {
  // No cross-field validations needed in MVP
  // When API keys are introduced, add validation here
}

/**
 * Memoization flag for runtime secret validation.
 * Only memoizes in production to prevent test false-passes.
 * Tests can change env vars between runs; production is static after deployment.
 */
let _prodSecretsValidated = false;

/**
 * Asserts runtime secrets are present when required.
 * Called at adapter boundary on first use, NOT during env module init.
 * Memoized in production only - tests validate on every call.
 *
 * @throws RuntimeSecretError if runtime secrets are missing
 */
export function assertRuntimeSecrets(env: ParsedEnv): void {
  // Only memoize in production (env is immutable after deployment)
  if (env.APP_ENV === "production" && _prodSecretsValidated) return;

  // MVP: Service-auth requires LITELLM_MASTER_KEY (except in test mode with fakes)
  if (
    env.APP_ENV === "production" &&
    (!env.LITELLM_MASTER_KEY || env.LITELLM_MASTER_KEY.trim() === "")
  ) {
    throw new RuntimeSecretError(
      "APP_ENV=production requires non-empty LITELLM_MASTER_KEY (service-auth mode)"
    );
  }

  // Set flag only in production
  if (env.APP_ENV === "production") {
    _prodSecretsValidated = true;
  }
}

/**
 * Typed error for runtime secret validation failures.
 * Allows consumers to detect secret issues without string matching.
 */
export class RuntimeSecretError extends Error {
  readonly code = "MISSING_RUNTIME_SECRET" as const;

  constructor(message: string) {
    super(message);
    this.name = "RuntimeSecretError";
  }
}
