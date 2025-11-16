// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server edge cases`
 * Purpose: Minimal tests to hit stubborn uncovered branches in server env module.
 * Scope: Non-ZodError fallback and proxy trap methods only. Does NOT test business logic.
 * Invariants: Surgical coverage of defensive code paths.
 * Side-effects: process.env (minimal)
 * Notes: Exists solely for coverage completeness on edge cases.
 * Links: src/shared/env/server.ts
 * @public
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

describe("server env edge cases", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it.skip("rethrows non-ZodError exceptions", async () => {
    // Skipped: ESM mocking limitations prevent testing this defensive fallback.
    // Line 133 is a defensive branch that's nearly impossible to hit naturally
    // since Zod always throws ZodError for schema validation failures.
  });

  it("supports proxy trap methods", async () => {
    // Set minimal valid env to get proxy working
    Object.assign(process.env, {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://test",
      LITELLM_MASTER_KEY: "test-key",
    });

    const { serverEnv } = await import("@/shared/env/server");

    // Hit ownKeys trap (line 144-145)
    const keys = Object.keys(serverEnv);
    expect(keys.length).toBeGreaterThan(0);

    // Hit has trap (line 149-151)
    expect("NODE_ENV" in serverEnv).toBe(true);

    // Hit getOwnPropertyDescriptor trap (line 146-148)
    const desc = Object.getOwnPropertyDescriptor(serverEnv, "NODE_ENV");
    expect(desc).toBeDefined();
  });
});
