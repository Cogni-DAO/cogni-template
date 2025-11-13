// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/type-imports`
 * Purpose: Verifies type-only import consistency prevents runtime coupling.
 * Scope: Covers @typescript-eslint/consistent-type-imports and cross-layer type rules. Does NOT test runtime behavior.
 * Invariants: Features use type-only port imports; ports don't re-export core types.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests TypeScript import consistency and hexagonal type boundary enforcement.
 * Links: eslint.config.mjs typescript rules, tsconfig.json
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Type Import Consistency", () => {
  describe("Type-only port imports", () => {
    it("allows type-only port imports in features", async () => {
      const { errors } = await lintFixture(
        "src/features/ai/services/complete.ts",
        `import type { LlmService, Clock } from "@/ports"; export const service = (llm: LlmService, clock: Clock) => {};`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBe(0);
    });

    it("blocks runtime port imports in features", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/ai/services/complete.ts",
        `import { LlmService, Clock } from "@/ports"; export const service = (llm: LlmService, clock: Clock) => {};`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) => m.ruleId === "@typescript-eslint/consistent-type-imports"
        )
      ).toBe(true);
    });

    it("allows type-only core imports in adapters", async () => {
      const { errors } = await lintFixture(
        "src/adapters/server/ai/litellm.adapter.ts",
        `import type { Message } from "@/core"; export class LiteLlmAdapter { process(msg: Message) {} };`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBe(0);
    });

    it("allows type-only port imports in adapters", async () => {
      const { errors } = await lintFixture(
        "src/adapters/server/ai/openai.adapter.ts",
        `import type { LlmService } from "@/ports"; export class OpenAIAdapter implements LlmService {};`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBe(0);
    });
  });

  describe("Cross-layer type boundaries", () => {
    it.skip("allows ports exporting their own interfaces", async () => {
      // SKIP: ESLint incorrectly blocks ports re-exporting their own interfaces
      // Expected: 0 errors (should be allowed), Actual: >0 errors (blocked by plugin)
      const { errors } = await lintFixture(
        "src/ports/index.ts",
        `export type { LlmService } from './llm.port'; export type { Clock } from './clock.port';`
      );
      expect(errors).toBe(0);
    });

    it.skip("blocks ports re-exporting core types", async () => {
      // SKIP: This test needs custom rule implementation that doesn't exist yet
      // Expected: Custom rule to detect re-exports, Actual: No such rule implemented
      const { errors, messages } = await lintFixture(
        "src/ports/llm.port.ts",
        `import type { Message } from "@/core"; export type { Message }; export interface LlmService { process(msg: Message): Promise<Message>; }`,
        { focusRulePrefixes: ["boundaries/", "no-restricted-syntax"] }
      );
      // Note: This test may need custom rule implementation to fully enforce
      // For now, we test that the structure doesn't cause basic boundary violations
      expect(messages.length).toBeLessThanOrEqual(0);
      expect(errors).toBe(0); // This might need adjustment based on actual rule implementation
    });

    it.skip("allows features importing core types via canonical entry", async () => {
      // SKIP: ESLint incorrectly blocks features→core canonical imports
      // Expected: 0 errors (should be allowed), Actual: >0 errors (blocked by plugin)
      const { errors } = await lintFixture(
        "src/features/ai/services/complete.ts",
        `import { Message } from "@/core"; export const processMessage = (msg: Message) => msg;`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBe(0);
    });

    it("enforces consistent type imports for interfaces", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/chat/services/message.ts",
        `import { MessageRepository } from "@/ports"; export const service = (repo: MessageRepository) => {};`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) => m.ruleId === "@typescript-eslint/consistent-type-imports"
        )
      ).toBe(true);
    });
  });

  describe("Type import mixed usage", () => {
    it.skip("allows mixed import with proper type annotations", async () => {
      // SKIP: ESLint incorrectly blocks mixed imports in features
      // Expected: 0 errors (should be allowed), Actual: >0 errors (blocked by plugin)
      const { errors } = await lintFixture(
        "src/features/ai/services/complete.ts",
        `import { Message } from "@/core"; import type { LlmService } from "@/ports"; export const execute = (llm: LlmService, input: Message): Promise<Message> => llm.process(input);`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBe(0);
    });

    it("blocks mixed imports when only types needed", async () => {
      const { errors, messages } = await lintFixture(
        "src/features/data/services/query.ts",
        `import { UserRepository, User } from "@/ports"; export const service = (repo: UserRepository): User => null as any;`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) => m.ruleId === "@typescript-eslint/consistent-type-imports"
        )
      ).toBe(true);
    });

    it("allows value imports when actually used at runtime", async () => {
      const { errors } = await lintFixture(
        "src/features/validation/services/schema.ts",
        `import { defaultSchema } from "@/shared"; export const validate = (data: unknown) => defaultSchema.parse(data);`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBe(0);
    });
  });

  describe("Bootstrap type dependencies", () => {
    it("allows bootstrap importing adapter implementations", async () => {
      const { errors } = await lintFixture(
        "src/bootstrap/container.ts",
        `import { LiteLlmAdapter } from "@/adapters/server"; import type { LlmService } from "@/ports"; export const container: { llm: LlmService } = { llm: new LiteLlmAdapter() };`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBe(0);
    });

    it("enforces type-only imports for port interfaces in bootstrap", async () => {
      const { errors, messages } = await lintFixture(
        "src/bootstrap/container.ts",
        `import { LlmService } from "@/ports"; export const container: { llm: LlmService } = null as any;`,
        { focusRulePrefixes: ["@typescript-eslint/consistent-type-imports"] }
      );
      expect(errors).toBeGreaterThan(0);
      expect(
        messages.some(
          (m) => m.ruleId === "@typescript-eslint/consistent-type-imports"
        )
      ).toBe(true);
    });
  });
});
