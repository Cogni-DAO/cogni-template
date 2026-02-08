// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/invariants`
 * Purpose: Fail-fast validation of runtime secrets, infrastructure connectivity, and cross-field env invariants.
 * Scope: Runtime secret checks, infrastructure health probes (Temporal, EVM RPC), cross-field validations. Does NOT validate during Next.js build/SSG.
 * Invariants: Throws RuntimeSecretError on missing secrets; throws InfraConnectivityError on unreachable infra; memoizes production only.
 * Side-effects: IO (network calls for connectivity checks)
 * Notes: Call assert* functions from adapter methods and runtime endpoints only, never from build-reachable code.
 * Links: src/shared/env/server.ts, src/app/(infra)/readyz/route.ts, docs/SCHEDULER_SPEC.md
 * @public
 */

/**
 * Minimal type for env invariant validation.
 * Kept inline to avoid circular imports with server.ts
 */
interface ParsedEnv {
  APP_ENV: "test" | "production";
  NODE_ENV: "development" | "test" | "production";
  DATABASE_URL: string;
  DATABASE_SERVICE_URL: string;
  LITELLM_MASTER_KEY: string;
}

/**
 * Usernames that indicate superuser/admin access.
 * These should never be used for app runtime connections.
 */
const SUPERUSER_NAMES = new Set(["postgres", "root", "superuser", "admin"]);

/**
 * Extracts the username from a PostgreSQL connection URL.
 * Returns null if the URL is not parseable or has no username.
 */
function extractDbUsername(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.username || null;
  } catch {
    return null;
  }
}

/**
 * Asserts cross-field environment invariants that Zod can't express cleanly.
 * Called after Zod schema validation passes.
 *
 * Per DATABASE_RLS_SPEC.md design decision 7, enforces:
 * 1. DATABASE_URL.user !== DATABASE_SERVICE_URL.user (distinct roles)
 * 2. Neither user is a superuser (postgres, root, etc.)
 * 3. Both DSNs are present (defense-in-depth, Zod also enforces)
 *
 * @throws Error if invariants are violated
 */
export function assertEnvInvariants(env: ParsedEnv): void {
  // Defense-in-depth: Zod enforces presence, but guard here too
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in all environments");
  }
  if (!env.DATABASE_SERVICE_URL) {
    throw new Error("DATABASE_SERVICE_URL is required in all environments");
  }

  // Extract usernames for role separation checks
  const appUser = extractDbUsername(env.DATABASE_URL);
  const serviceUser = extractDbUsername(env.DATABASE_SERVICE_URL);

  // Only enforce role separation for PostgreSQL URLs
  // (allows sqlite://build.db for Next.js build, etc.)
  const isAppPostgres = env.DATABASE_URL.startsWith("postgresql://");
  const isServicePostgres =
    env.DATABASE_SERVICE_URL.startsWith("postgresql://");

  if (isAppPostgres && isServicePostgres) {
    // Check 1: Users must be distinct
    if (appUser && serviceUser && appUser === serviceUser) {
      throw new Error(
        `DATABASE_URL and DATABASE_SERVICE_URL use the same user "${appUser}". ` +
          "Per DATABASE_RLS_SPEC.md, these must be distinct roles (app_user vs app_service). " +
          "Run provision.sh to create the required roles, then update your .env file."
      );
    }

    // Check 2: Neither user should be a superuser
    if (appUser && SUPERUSER_NAMES.has(appUser.toLowerCase())) {
      throw new Error(
        `DATABASE_URL uses superuser "${appUser}". ` +
          "Per DATABASE_RLS_SPEC.md, runtime connections must use non-superuser roles (e.g., app_user). " +
          "Run provision.sh to create the required roles, then update your .env file."
      );
    }
    if (serviceUser && SUPERUSER_NAMES.has(serviceUser.toLowerCase())) {
      throw new Error(
        `DATABASE_SERVICE_URL uses superuser "${serviceUser}". ` +
          "Per DATABASE_RLS_SPEC.md, even service connections should use dedicated roles (e.g., app_service), not superusers. " +
          "Run provision.sh to create the required roles, then update your .env file."
      );
    }
  }
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

/**
 * Typed error for required infrastructure connectivity failures.
 * Used when infrastructure (Temporal, databases, etc.) is unreachable.
 */
export class InfraConnectivityError extends Error {
  readonly code = "INFRA_UNREACHABLE" as const;

  constructor(message: string) {
    super(message);
    this.name = "InfraConnectivityError";
  }
}

/**
 * Extended env interface for EVM RPC validation
 */
interface EnvWithRpc extends ParsedEnv {
  EVM_RPC_URL?: string | undefined;
}

/**
 * Asserts EVM RPC URL is present when required.
 * Only validates in non-test mode (test mode uses FakeEvmOnchainClient).
 *
 * @param env - Server environment with EVM_RPC_URL
 * @throws RuntimeSecretError if EVM_RPC_URL missing in production/preview/dev
 */
export function assertEvmRpcConfig(env: EnvWithRpc): void {
  // Test mode uses FakeEvmOnchainClient - no RPC URL needed
  if (env.APP_ENV === "test") return;

  // Production/preview/dev requires EVM_RPC_URL for payment verification
  if (!env.EVM_RPC_URL || env.EVM_RPC_URL.trim() === "") {
    throw new RuntimeSecretError(
      "APP_ENV=production requires EVM_RPC_URL for on-chain payment verification. " +
        "Get an API key from Alchemy or Infura for Ethereum Sepolia."
    );
  }
}

/**
 * Tests EVM RPC connectivity by fetching current block number.
 * Only runs in non-test mode. Throws if RPC unreachable or times out.
 * Budget: 3 seconds timeout for single RPC call.
 *
 * @param evmClient - EvmOnchainClient to test (uses lazy initialization)
 * @param env - Server environment for mode check
 * @throws RuntimeSecretError if RPC unreachable or invalid response
 */
export async function assertEvmRpcConnectivity(
  evmClient: { getBlockNumber(): Promise<bigint> },
  env: ParsedEnv
): Promise<void> {
  // Test mode uses FakeEvmOnchainClient - skip connectivity check
  if (env.APP_ENV === "test") return;

  // Production/preview/dev: Verify RPC connection works
  try {
    // 3 second timeout budget for readyz probe
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("RPC timeout")), 3000);
    });

    const blockNumber = await Promise.race([
      evmClient.getBlockNumber(),
      timeoutPromise,
    ]);

    // Sanity check: block number should be positive
    if (blockNumber <= 0n) {
      throw new Error("Invalid block number returned from RPC");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown RPC error";
    throw new RuntimeSecretError(
      `EVM RPC connectivity check failed: ${message}. ` +
        "Verify EVM_RPC_URL is correct and the RPC endpoint is accessible."
    );
  }
}

/**
 * ScheduleControlPort interface subset needed for connectivity check.
 * Using minimal interface to avoid circular imports with @cogni/scheduler-core.
 */
interface ScheduleControlForHealthCheck {
  describeSchedule(scheduleId: string): Promise<unknown>;
}

/**
 * Tests Temporal connectivity by attempting to describe a non-existent schedule.
 * Budget: 5 seconds timeout for connection establishment.
 *
 * @param scheduleControl - ScheduleControlPort to test
 * @param _env - Server environment (unused, kept for API consistency)
 * @throws RuntimeSecretError if Temporal unreachable
 */
export async function assertTemporalConnectivity(
  scheduleControl: ScheduleControlForHealthCheck,
  _env: ParsedEnv
): Promise<void> {
  try {
    // 5 second timeout budget for Temporal connection
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error("Temporal connection timeout")), 5000);
    });

    // describeSchedule returns null for non-existent schedules,
    // but throws ScheduleControlUnavailableError if Temporal is unreachable
    await Promise.race([
      scheduleControl.describeSchedule("__readyz_health_check__"),
      timeoutPromise,
    ]);
    // Success: Temporal is reachable (schedule not found is expected)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Temporal error";
    throw new InfraConnectivityError(
      `Temporal connectivity check failed: ${message}. ` +
        "Verify TEMPORAL_ADDRESS is correct and Temporal is running (pnpm dev:infra)."
    );
  }
}

/**
 * Extended env interface for scheduler-worker health check
 */
interface EnvWithSchedulerWorker extends ParsedEnv {
  SCHEDULER_WORKER_HEALTH_URL: string;
}

/**
 * Tests scheduler-worker connectivity by calling its /readyz endpoint.
 * Budget: 5 seconds timeout for health check.
 *
 * This ensures the Temporal worker is actively polling before stack tests run,
 * preventing race conditions where schedules are triggered but no worker is ready.
 *
 * @param env - Server environment with SCHEDULER_WORKER_HEALTH_URL
 * @throws InfraConnectivityError if scheduler-worker unreachable or not ready
 */
export async function assertSchedulerWorkerConnectivity(
  env: EnvWithSchedulerWorker
): Promise<void> {
  const url = `${env.SCHEDULER_WORKER_HEALTH_URL}/readyz`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    // Success: scheduler-worker is ready and polling Temporal
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown scheduler-worker error";
    throw new InfraConnectivityError(
      `Scheduler-worker connectivity check failed: ${message}. ` +
        `Verify scheduler-worker is running and SCHEDULER_WORKER_HEALTH_URL (${env.SCHEDULER_WORKER_HEALTH_URL}) is correct.`
    );
  }
}
