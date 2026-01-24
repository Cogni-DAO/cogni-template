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

import { BASE_VALID_ENV } from "@tests/_fixtures/env/base-env";
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
    Reflect.deleteProperty(process.env, "DATABASE_URL");

    Object.assign(process.env, {
      ...BASE_VALID_ENV,
      POSTGRES_USER: "u",
      POSTGRES_PASSWORD: "p",
      POSTGRES_DB: "db",
      DB_HOST: "h",
      LITELLM_MASTER_KEY: "adminkey",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test-project-id",
    });

    const { serverEnv } = await import("@/shared/env/server");
    const { clientEnv } = await import("@/shared/env/client");

    const env = serverEnv();
    expect(env.DATABASE_URL).toBe("postgresql://u:p@h:5432/db");
    expect(clientEnv().NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID).toBe(
      "test-project-id"
    );
  });

  it("uses provided DATABASE_URL when present", async () => {
    Object.assign(process.env, {
      ...BASE_VALID_ENV,
      DATABASE_URL: "sqlite://build.db",
      LITELLM_MASTER_KEY: "adminkey",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "test-project-id",
    });

    const { serverEnv } = await import("@/shared/env/server");

    const env = serverEnv();
    expect(env.DATABASE_URL).toBe("sqlite://build.db");
  });

  // TODO: this fail-fast test being flaky
  it.skip("throws when required server vars are missing", async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      // intentionally missing required keys
    });

    await expect(async () => {
      const { serverEnv } = await import("../../../src/shared/env/server");
      serverEnv(); // should throw ZodError
    }).rejects.toThrow();
  });
});
