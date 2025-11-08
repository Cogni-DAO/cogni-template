// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/boundaries`
 * Purpose: Verifies hexagonal architecture boundaries via eslint-plugin-boundaries.
 * Scope: Covers core/ports/app/shared layer isolation. Does NOT test import resolution.
 * Invariants: Layers must respect dependency direction; no circular references.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests boundaries/element-types rule enforcement across architecture layers.
 * Links: eslint.config.mjs boundaries settings, docs/ARCHITECTURE.md
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Hexagonal Layer Boundaries", () => {
  describe("Core layer", () => {
    it("allows core importing core", async () => {
      const { errors } = await lintFixture(
        "src/core/auth/session.ts",
        `import { other } from "@/core/other/model"; export default other;`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBe(0);
    });

    it("blocks core importing features", async () => {
      const { errors, messages } = await lintFixture(
        "src/core/auth/session.ts",
        `import { Terminal } from "@/features/home/components/Terminal"; export default Terminal;`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some((m) => m.ruleId === "boundaries/element-types")
      ).toBe(true);
    });
  });

  describe("Ports layer", () => {
    it("allows ports importing core", async () => {
      const { errors } = await lintFixture(
        "src/ports/auth.port.ts",
        `import { AuthSession } from "@/core/auth/session"; export type AuthPort = { session: AuthSession };`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBe(0);
    });

    it.skip("blocks ports importing adapters", async () => {
      const { errors, messages } = await lintFixture(
        "src/ports/auth.port.ts",
        `import { DbClient } from "@/adapters/server/db"; export default DbClient;`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some((m) => m.ruleId === "boundaries/element-types")
      ).toBe(true);
    });
  });

  describe("App layer", () => {
    it("allows app importing features", async () => {
      const { errors } = await lintFixture(
        "src/app/api/auth/route.ts",
        `import { authAction } from "@/features/auth/actions"; export default authAction;`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBe(0);
    });

    it.skip("blocks app importing core directly", async () => {
      const { errors, messages } = await lintFixture(
        "src/app/api/auth/route.ts",
        `import { AuthService } from "@/core/auth/service"; export default AuthService;`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some((m) => m.ruleId === "boundaries/element-types")
      ).toBe(true);
    });
  });

  describe("Shared layer", () => {
    it("blocks shared importing features", async () => {
      const { errors, messages } = await lintFixture(
        "src/shared/util/bad.ts",
        `import { Terminal } from "@/features/home/components/Terminal"; export default Terminal;`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some((m) => m.ruleId === "boundaries/element-types")
      ).toBe(true);
    });
  });
});
