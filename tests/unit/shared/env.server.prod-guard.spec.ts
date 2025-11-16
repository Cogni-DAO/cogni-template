// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Verifies production guard prevents APP_ENV=test in production deployments.
 * Scope: Isolated testing of production guard invariant using controlled process.env. Does NOT test other env validation.
 * Invariants: Module cache reset between tests; clean env state; production guard throws EnvValidationError with specific message.
 * Side-effects: process.env
 * Notes: Uses vi.resetModules() to force re-evaluation; minimal required env to isolate guard failure.
 * Links: src/shared/env/server.ts
 * @public
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

describe("serverEnv APP_ENV production guard", () => {
  beforeEach(() => {
    vi.resetModules(); // ensure we re-evaluate the module each test
    process.env = { ...ORIGINAL_ENV }; // fresh copy
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV; // restore
  });

  it("throws EnvValidationError when NODE_ENV=production and APP_ENV=test", async () => {
    Object.assign(process.env, { NODE_ENV: "production", APP_ENV: "test" });

    // minimal required env so schema doesn't fail for other reasons
    Object.assign(process.env, {
      DATABASE_URL: "postgres://test",
      LITELLM_MASTER_KEY: "test-key",
    });

    // Import AFTER env is set so defaults/superRefine see the right values
    const { ensureServerEnv, EnvValidationError } = await import(
      "@/shared/env/server"
    );

    expect(() => ensureServerEnv()).toThrow(EnvValidationError);

    // Check the actual error details for the production guard
    try {
      ensureServerEnv();
      // Should not reach here
      expect.fail("Expected ensureServerEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      const envError = error as InstanceType<typeof EnvValidationError>;
      expect(envError.meta.invalid).toContain("APP_ENV");
    }
  });

  it("allows APP_ENV=test in development", async () => {
    Object.assign(process.env, {
      NODE_ENV: "development",
      APP_ENV: "test",
      DATABASE_URL: "postgres://test",
      LITELLM_MASTER_KEY: "test-key",
    });

    const { ensureServerEnv } = await import("@/shared/env/server");

    expect(() => ensureServerEnv()).not.toThrow();
  });

  it("allows production without APP_ENV set", async () => {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DATABASE_URL: "postgres://test",
      LITELLM_MASTER_KEY: "test-key",
    });
    // APP_ENV intentionally unset

    const { ensureServerEnv } = await import("@/shared/env/server");

    expect(() => ensureServerEnv()).not.toThrow();
  });
});
