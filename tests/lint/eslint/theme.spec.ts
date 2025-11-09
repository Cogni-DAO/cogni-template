// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/theme`
 * Purpose: Verifies ESLint theme manipulation rules block unsafe document access.
 * Scope: Covers document.documentElement blocks and theme hydration safety. Does not test runtime theme behavior.
 * Invariants: ESLint blocks direct DOM manipulation; enforces next-themes usage; validates hydration safety.
 * Side-effects: none
 * Notes: Uses eslint fixtures; tests theme/fail_document_element.ts patterns.
 * Links: src/styles/theme rules, next-themes docs
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("ESLint Theme Rules", () => {
  it("should block direct document.documentElement manipulation", async () => {
    const { errors, messages } = await lintFixture(
      "theme/fail_document_element.ts",
      undefined,
      {
        focusRulePrefixes: ["no-restricted-properties"],
      }
    );

    expect(errors).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-restricted-properties",
          message:
            "'document.documentElement' is restricted from being used. Theme and <html> class mutations must go through ThemeProvider / ModeToggle.",
        }),
      ])
    );
  });
});
