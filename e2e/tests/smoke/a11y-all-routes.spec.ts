// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/smoke/a11y-all-routes`
 * Purpose: Automated accessibility testing for all public routes using dynamic route discovery.
 * Scope: Tests all routes tagged with 'a11y-smoke' against wcag2a/wcag2aa standards. Does not test auth routes and private content.
 * Invariants: Zero accessibility violations; WCAG 2.1 AA compliance; axe-core automated checks pass
 * Side-effects: IO, time, global
 * Notes: Black-box testing via HTTP route manifest; replaces individual hardcoded a11y tests
 * Links: @axe-core/playwright documentation, WCAG 2.1 guidelines
 * @internal
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

interface RouteEntry {
  path: string;
  tags?: string[];
}

test("[smoke] all a11y-smoke routes pass axe core checks", async ({ page }) => {
  // Fetch manifest over HTTP (black-box)
  const response = await page.goto("/meta/route-manifest");
  expect(response?.ok()).toBeTruthy();

  const body = await response?.text();
  if (!body) throw new Error("Empty response body");
  const json = JSON.parse(body) as { routes: RouteEntry[] };
  const a11yRoutes = json.routes;

  for (const route of a11yRoutes) {
    await test.step(`route: ${route.path}`, async () => {
      await page.goto(route.path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"]) // strict enough, not noisy
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
