// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/smoke/theme-paths`
 * Purpose: Tests theme resolution logic for system preference vs localStorage override.
 * Scope: Validates theme-init.js behavior with different browser/storage states. Does not test UI interactions.
 * Invariants: System theme follows prefers-color-scheme; stored theme overrides system; persistence works.
 * Side-effects: IO, time, global
 * Notes: Tests browser colorScheme setting and localStorage manipulation.
 * Links: public/theme-init.js
 * @internal
 */

import { expect, test } from "@playwright/test";

test.describe("system color scheme path", () => {
  test.use({ colorScheme: "dark" as const });

  test("respects prefers-color-scheme when no stored theme", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.removeItem("theme"));
    await page.goto("/");
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(isDark).toBe(true);
  });
});

test.describe("stored theme path", () => {
  test("uses stored theme and persists", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "light"));
    await page.goto("/");
    const isLight = await page.evaluate(() =>
      document.documentElement.classList.contains("light")
    );
    expect(isLight).toBe(true);
    await page.reload();
    const stillLight = await page.evaluate(() =>
      document.documentElement.classList.contains("light")
    );
    expect(stillLight).toBe(true);
  });
});
