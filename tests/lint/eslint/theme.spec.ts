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
