// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Verifies environment variable validation and schema parsing of server and client env modules under different env conditions.
 * Scope: Covers Zod schema validation, env var processing, and error cases. Does NOT test actual env loading or runtime behavior.
 * Invariants: Module cache resets between tests; env vars restore consistently; validation errors throw with expected messages.
 * Side-effects: process.env
 * Notes: Uses vi.resetModules for fresh imports; tests both server and client schemas; env restoration via beforeEach/afterEach.
 * Links: src/shared/env/server.ts, src/shared/env/client.ts
 * @public
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules(); // clear Node's module cache
  process.env = { ...ORIGINAL_ENV }; // clean copy for each test
});

afterEach(() => {
  process.env = ORIGINAL_ENV; // restore after suite
});

describe("env schemas", () => {
  it("parses minimal valid env", async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      APP_BASE_URL: "http://localhost:3000",
      DATABASE_URL: "postgres://u:p@h:5432/db?sslmode=require",
      SESSION_SECRET: "x".repeat(32),
      LITELLM_BASE_URL: "http://localhost:4000",
      LITELLM_ADMIN_KEY: "adminkey",
      OPENROUTER_API_KEY: "or-key",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "proj",
      NEXT_PUBLIC_CHAIN_ID: "1",
    });

    const { serverEnv } = await import("../../../src/shared/env/server");
    const { clientEnv } = await import("../../../src/shared/env/client");

    expect(serverEnv.APP_BASE_URL).toBe("http://localhost:3000");
    expect(clientEnv.NEXT_PUBLIC_CHAIN_ID).toBe(1);
  });

  it("throws when required server vars are missing", async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      // intentionally missing required keys
    });

    await expect(import("../../../src/shared/env/server")).rejects.toThrow();
  });
});
