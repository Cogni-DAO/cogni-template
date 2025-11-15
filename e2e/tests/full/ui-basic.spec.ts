// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/ui/basic`
 * Purpose: Verifies that the homepage loads and displays without hydration warnings.
 * Scope: Covers basic page load functionality; does not cover detailed UI interactions.
 * Invariants: Homepage must load with proper title and no hydration mismatches.
 * Side-effects: IO, time, global
 * Notes: Tests both light and dark color schemes via project configuration.
 * Links: src/app/page.tsx, playwright.config.ts
 * @internal
 */

import { expect, test } from "@playwright/test";

test("Homepage loads with basic layout elements", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "warning" || type === "error") warnings.push(msg.text());
  });

  await page.goto("/");

  // Assert page loads and has basic content
  await expect(page).toHaveTitle(/Cogni/i);

  // Assert no hydration warnings
  expect(warnings.join("\n")).not.toMatch(
    /hydration|did not match|content mismatch/i
  );
});
