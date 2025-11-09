// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/smoke/header-a11y`
 * Purpose: Tests header accessibility landmarks and navigation semantics.
 * Scope: Validates skip link, banner/nav landmarks, and active link state. Does not test mobile navigation or keyboard focus.
 * Invariants: Skip link visible; proper ARIA landmarks; exactly one active nav link.
 * Side-effects: IO, time, global
 * Notes: Cheap smoke test that catches accessibility regressions.
 * Links: src/components/Header.tsx
 * @internal
 */

import { expect, test } from "@playwright/test";

test("[smoke] header landmarks and active link", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href="#main"]')).toBeVisible(); // skip link
  await expect(page.locator('header[role="banner"]')).toBeVisible();
  await expect(page.locator('nav[aria-label="Primary"]')).toBeVisible();
  // Active state
  const active = page.locator(
    'nav[aria-label="Primary"] a[aria-current="page"]'
  );
  await expect(active).toHaveCount(1);
});
