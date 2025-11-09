// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/smoke/a11y-home`
 * Purpose: Automated accessibility testing for home page using axe-core WCAG validation.
 * Scope: Tests home page against wcag2a/wcag2aa standards. Does not test interactive behavior or forms.
 * Invariants: Zero accessibility violations; WCAG 2.1 AA compliance; axe-core automated checks pass.
 * Side-effects: IO, time, global
 * Notes: Part of systematic accessibility prevention strategy; complements ESLint and contract tests.
 * Links: @axe-core/playwright documentation, WCAG 2.1 guidelines
 * @internal
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("[smoke] home passes axe core checks", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"]) // strict enough, not noisy
    .analyze();
  expect(results.violations).toEqual([]);
});
