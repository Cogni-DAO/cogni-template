#!/usr/bin/env tsx
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/check-runtime-env`
 * Purpose: Runtime environment validation script for container startup and CI runtime checks.
 * Scope: Validates required runtime environment variables including DB configuration. Does not handle builds or build-time vars.
 * Invariants: Exits with code 1 on validation failure; exits with code 0 on success; provides clear error messages.
 * Side-effects: IO
 * Notes: Uses serverEnv() to validate all runtime requirements; exits with status code on failure; called from Docker CMD or CI deploy scripts.
 * Links: Used by container startup, CI deployment validation
 * @internal
 */

import { EnvValidationError, serverEnv } from "@/shared/env";

async function main(): Promise<void> {
  try {
    console.log("Checking runtime environment configuration...");

    const env = serverEnv();

    console.log("✅ Runtime environment validation passed");
    console.log(`   NODE_ENV: ${env.NODE_ENV}`);
    console.log(`   APP_ENV: ${env.APP_ENV}`);
    console.log(`   Database: ${env.DATABASE_URL ? "configured" : "missing"}`);
    console.log(`   DATABASE_URL: ${env.DATABASE_URL}`);
    console.log(`   LiteLLM: ${env.LITELLM_BASE_URL}`);

    process.exit(0);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      console.error("❌ Runtime environment validation failed");
      console.error(`   Error: ${error.message}`);

      if (error.meta.missing.length > 0) {
        console.error(`   Missing variables: ${error.meta.missing.join(", ")}`);
      }

      if (error.meta.invalid.length > 0) {
        console.error(`   Invalid variables: ${error.meta.invalid.join(", ")}`);
      }

      process.exit(1);
    } else {
      console.error("❌ Unexpected error during runtime environment check");
      console.error(error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
