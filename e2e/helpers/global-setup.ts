// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/helpers/global-setup`
 * Purpose: Global setup for Playwright tests - environment validation and health checks.
 * Scope: Runs once before all tests; validates target URLs are reachable; does not run tests or modify application state.
 * Invariants: Must ensure test target is healthy before running tests.
 * Side-effects: IO, time, global
 * Notes: Used by playwright.config.ts globalSetup option.
 * Links: playwright.config.ts
 * @internal
 */

import type { FullConfig } from "@playwright/test";

export default async function globalSetup(cfg: FullConfig): Promise<void> {
  const isCI = !!process.env.CI;
  const BASE_URL = process.env.TEST_BASE_URL;
  const ENABLE_PROD = process.env.E2E_ENABLE_PROD;

  console.log("🎭 Playwright Global Setup");
  console.log(`Environment: ${isCI ? "CI" : "Local"}`);

  const anyProject = cfg.projects[0];
  const baseURL = (anyProject?.use?.baseURL as string | undefined) ?? BASE_URL;

  if (baseURL) {
    console.log(`Base URL: ${baseURL}`);

    // Health check the target URL
    try {
      const res = await fetch(baseURL, { method: "HEAD" });
      if (!res.ok) {
        throw new Error(`Target not healthy: ${baseURL} (${res.status})`);
      }
      console.log(`✅ Target healthy: ${baseURL}`);
    } catch (error) {
      throw new Error(`Target not reachable: ${baseURL} - ${error}`);
    }
  }

  // Guard prod tests
  if (ENABLE_PROD) {
    console.log("🚨 Production tests enabled");
  }

  // Validate environment in CI
  if (isCI && !BASE_URL) {
    throw new Error("CI environment requires TEST_BASE_URL");
  }
}
