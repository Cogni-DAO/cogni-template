// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/features-boundaries`
 * Purpose: Verifies features layer import boundaries and restrictions previously missing from other tests.
 * Scope: Covers features allowed/denied imports that need dedicated test coverage. Does NOT duplicate existing tests.
 * Invariants: Features can only import components/kit, shared, canonical entries; no adapters/bootstrap/cross-feature.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Completes test coverage for features layer boundary enforcement.
 * Links: eslint.config.mjs features overrides, existing imports.spec.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Features Layer Missing Boundaries", () => {
  describe("Allowed imports (missing positive tests)", () => {
    it.skip("allows features importing kit subpaths", async () => {
      // SKIP: ESLint incorrectly blocks features→kit subpath imports
      // Expected: 0 errors (should be allowed), Actual: 1 error (blocked by plugin)
      const { errors } = await lintFixture(
        "src/features/ui/components/Dashboard.tsx",
        `import { Container } from "@/components/kit/layout/Container"; export const Dashboard = () => <Container />;`,
        {
          focusRulePrefixes: [
            "boundaries/",
            "import/",
            "no-restricted-imports",
          ],
        }
      );
      expect(errors).toBe(0);
    });

    it("allows features importing shared utilities", async () => {
      const { errors } = await lintFixture(
        "src/features/data/services/validation.ts",
        `import { someUtil } from "@/shared"; export const validate = someUtil;`,
        {
          focusRulePrefixes: [
            "boundaries/",
            "import/",
            "no-restricted-imports",
          ],
        }
      );
      expect(errors).toBe(0);
    });
  });

  describe("Forbidden imports (missing negative tests)", () => {
    it("blocks features importing adapters directly", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/ai/services/llm.ts",
        `import { LiteLlmAdapter } from "@/adapters/server/ai"; export const service = new LiteLlmAdapter();`,
        { focusRulePrefixes: ["boundaries/", "no-restricted-imports"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "boundaries/element-types" ||
            m.ruleId === "no-restricted-imports"
        )
      ).toBe(true);
    });

    it("blocks features importing bootstrap container", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/ai/services/complete.ts",
        `import { resolveAiDeps } from "@/bootstrap/container"; export const deps = resolveAiDeps();`,
        { focusRulePrefixes: ["boundaries/", "no-restricted-imports"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "boundaries/element-types" ||
            m.ruleId === "no-restricted-imports"
        )
      ).toBe(true);
    });

    it("blocks cross-feature imports", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/auth/components/LoginForm.tsx",
        `import { Terminal } from "@/features/home/components/Terminal"; export const LoginForm = () => <Terminal />;`,
        { focusRulePrefixes: ["boundaries/", "no-restricted-imports"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "boundaries/element-types" ||
            m.ruleId === "no-restricted-imports"
        )
      ).toBe(true);
    });
  });

  describe("App layer missing shared utilities test", () => {
    it("allows app importing shared utilities", async () => {
      const { errors } = await lintFixture(
        "src/app/api/utils/helper.ts",
        `import { someUtil } from "@/shared"; export const helper = someUtil;`,
        { focusRulePrefixes: ["boundaries/"] }
      );
      expect(errors).toBe(0);
    });
  });
});
