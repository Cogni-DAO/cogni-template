// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/container`
 * Purpose: Unit tests for dependency injection container environment-based adapter wiring.
 * Scope: Tests adapter selection logic based on APP_ENV; stateless container behavior. Does NOT test adapter implementations.
 * Invariants: Module cache reset between tests; clean env state; container wiring matches expected adapter types.
 * Side-effects: process.env
 * Notes: Uses vi.resetModules() to force fresh imports; tests both test and production adapter wiring.
 * Links: src/bootstrap/container.ts
 * @public
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

describe("bootstrap container DI wiring", () => {
  beforeEach(() => {
    vi.resetModules(); // ensure fresh module evaluation
    process.env = { ...ORIGINAL_ENV }; // clean env copy
    delete process.env.SESSION_SECRET;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV; // restore
  });

  describe("createContainer adapter selection", () => {
    it("wires FakeLlmAdapter when APP_ENV=test", async () => {
      // Set up test environment
      Object.assign(process.env, {
        NODE_ENV: "test",
        APP_ENV: "test",
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "test_db",
        LITELLM_MASTER_KEY: "test-key",
        SESSION_SECRET: "x".repeat(32),
      });

      // Import after env setup to get correct adapter wiring
      const { createContainer } = await import("@/bootstrap/container");
      const { FakeLlmAdapter } = await import("@/adapters/test");

      const container = createContainer();

      expect(container.llmService).toBeInstanceOf(FakeLlmAdapter);
      expect(container.clock).toBeDefined();
    });

    it("wires LiteLlmAdapter when APP_ENV=production", async () => {
      // Set up production environment
      Object.assign(process.env, {
        NODE_ENV: "production",
        APP_ENV: "production",
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "prod_db",
        LITELLM_MASTER_KEY: "prod-key",
        SESSION_SECRET: "x".repeat(32),
      });

      // Import after env setup
      const { createContainer } = await import("@/bootstrap/container");
      const { LiteLlmAdapter } = await import("@/adapters/server");

      const container = createContainer();

      expect(container.llmService).toBeInstanceOf(LiteLlmAdapter);
      expect(container.clock).toBeDefined();
    });

    it("wires LiteLlmAdapter in development mode with APP_ENV=production", async () => {
      Object.assign(process.env, {
        NODE_ENV: "development",
        APP_ENV: "production",
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "dev_db",
        LITELLM_MASTER_KEY: "dev-key",
        SESSION_SECRET: "x".repeat(32),
      });

      const { createContainer } = await import("@/bootstrap/container");
      const { LiteLlmAdapter } = await import("@/adapters/server");

      const container = createContainer();

      expect(container.llmService).toBeInstanceOf(LiteLlmAdapter);
    });
  });

  describe("container behavior", () => {
    beforeEach(() => {
      // Set minimal valid env for these tests
      Object.assign(process.env, {
        NODE_ENV: "test",
        APP_ENV: "test",
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "test_db",
        LITELLM_MASTER_KEY: "test-key",
        SESSION_SECRET: "x".repeat(32),
      });
    });

    it("returns fresh container instances on each call", async () => {
      const { createContainer } = await import("@/bootstrap/container");

      const container1 = createContainer();
      const container2 = createContainer();

      expect(container1).not.toBe(container2);
      expect(container1.llmService).not.toBe(container2.llmService);
      expect(container1.clock).not.toBe(container2.clock);
    });

    it("resolveAiDeps alias works correctly", async () => {
      const { createContainer, resolveAiDeps } = await import(
        "@/bootstrap/container"
      );

      const container1 = createContainer();
      const container2 = resolveAiDeps();

      // Should be equivalent but different instances
      expect(container1).not.toBe(container2);
      expect(container1.llmService.constructor).toBe(
        container2.llmService.constructor
      );
    });

    it("provides all required container dependencies", async () => {
      const { createContainer } = await import("@/bootstrap/container");

      const container = createContainer();

      expect(container).toHaveProperty("llmService");
      expect(container).toHaveProperty("clock");
      expect(container.llmService.completion).toBeTypeOf("function");
    });
  });
});
