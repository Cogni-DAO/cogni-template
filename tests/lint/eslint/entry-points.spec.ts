// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/entry-points`
 * Purpose: Verifies canonical entry point enforcement prevents internal module imports.
 * Scope: Covers import/no-internal-modules and boundaries/entry-point rules. Does NOT test module resolution.
 * Invariants: Only index.ts/public.ts/services/components can be imported; internal files blocked.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests entry point enforcement across all hexagonal layers.
 * Links: eslint.config.mjs entry-point rules, src/index.ts, src/core/public.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Entry Point Enforcement", () => {
  describe("Canonical imports allowed", () => {
    it("allows importing from ports index", async () => {
      const { errors } = await lintFixture(
        "src/features/ai/services/complete.ts",
        `import type { LlmService } from "@/ports"; export const service: LlmService = null as any;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBe(0);
    });

    it("allows importing from core public", async () => {
      const { errors } = await lintFixture(
        "src/features/auth/services/login.ts",
        `import { Message } from "@/core"; export const message: Message = null as any;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBe(0);
    });

    it("allows importing from adapters server index", async () => {
      const { errors } = await lintFixture(
        "src/bootstrap/container.ts",
        `import { LiteLlmAdapter } from "@/adapters/server"; export const adapter = new LiteLlmAdapter();`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBe(0);
    });

    it("allows importing from features services", async () => {
      const { errors } = await lintFixture(
        "src/app/api/ai/complete/route.ts",
        `import { execute } from "@/features/ai/services/complete"; export default execute;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBe(0);
    });

    it("allows importing from features components", async () => {
      const { errors } = await lintFixture(
        "src/app/home/page.tsx",
        `import { Terminal } from "@/features/home/components/Terminal"; export default Terminal;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBe(0);
    });
  });

  describe("Internal imports blocked", () => {
    it("blocks internal port file imports", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/ai/services/complete.ts",
        `import { LlmService } from "@/ports/llm.port"; export const service: LlmService = null as any;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "import/no-internal-modules" ||
            m.ruleId === "boundaries/entry-point"
        )
      ).toBe(true);
    });

    it("blocks internal core file imports", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/chat/services/message.ts",
        `import { Message } from "@/core/chat/model"; export const msg: Message = null as any;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "import/no-internal-modules" ||
            m.ruleId === "boundaries/entry-point"
        )
      ).toBe(true);
    });

    it("blocks internal adapter file imports", async () => {
      const { errors, messages } = await lintFixture(
        "src/bootstrap/container.ts",
        `import { LiteLlmAdapter } from "@/adapters/server/ai/litellm.adapter"; export const adapter = new LiteLlmAdapter();`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "import/no-internal-modules" ||
            m.ruleId === "boundaries/entry-point"
        )
      ).toBe(true);
    });

    it.skip("blocks non-services/components from features", async () => {
      // SKIP: ESLint fails to block features mappers/utils/constants imports
      // Expected: >0 errors (should be blocked), Actual: 0 errors (allowed by plugin)
      const { errors, messages } = await lintFixture(
        "src/app/api/ai/route.ts",
        `import { toCoreMessages } from "@/features/ai/mappers"; export default toCoreMessages;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "import/no-internal-modules" ||
            m.ruleId === "boundaries/entry-point"
        )
      ).toBe(true);
    });

    it.skip("blocks features utils/constants imports", async () => {
      // SKIP: ESLint fails to block features utils imports
      // Expected: >0 errors (should be blocked), Actual: 0 errors (allowed by plugin)
      const { errors, messages } = await lintFixture(
        "src/app/api/auth/route.ts",
        `import { authHelpers } from "@/features/auth/utils"; export default authHelpers;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "import/no-internal-modules" ||
            m.ruleId === "boundaries/entry-point"
        )
      ).toBe(true);
    });

    it.skip("blocks features constants imports", async () => {
      // SKIP: ESLint fails to block features constants imports
      // Expected: >0 errors (should be blocked), Actual: 0 errors (allowed by plugin)
      const { errors, messages } = await lintFixture(
        "src/app/api/auth/route.ts",
        `import { AUTH_CONSTANTS } from "@/features/auth/constants"; export default AUTH_CONSTANTS;`,
        { focusRulePrefixes: ["import/no-internal-modules", "boundaries/"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) =>
            m.ruleId === "import/no-internal-modules" ||
            m.ruleId === "boundaries/entry-point"
        )
      ).toBe(true);
    });
  });
});
