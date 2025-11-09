// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/smoke/a11y-pricing`
 * Purpose: Automated accessibility testing for pricing page using axe-core WCAG validation.
 * Scope: Tests pricing page against wcag2a/wcag2aa standards. Does not test interactive behavior or forms.
 * Invariants: Zero accessibility violations; WCAG 2.1 AA compliance; axe-core automated checks pass.
 * Side-effects: IO, time, global
 * Notes: Part of systematic accessibility prevention strategy; complements ESLint and contract tests.
 * Links: @axe-core/playwright documentation, WCAG 2.1 guidelines
 * @internal
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("[smoke] pricing passes axe core checks", async ({ page }) => {
  await page.goto("/pricing");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"]) // strict enough, not noisy
    .analyze();
  expect(results.violations).toEqual([]);
});
