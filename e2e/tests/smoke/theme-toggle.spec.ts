// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/smoke/theme-toggle`
 * Purpose: Tests ModeToggle component interaction and theme switching stability.
 * Scope: Validates dropdown interaction, theme persistence, and layout stability. Does not test SSR or hydration.
 * Invariants: Theme switches via dropdown; changes persist on reload; trigger width stays stable.
 * Side-effects: IO, time, global
 * Notes: Tests actual user interaction with theme toggle component.
 * Links: src/components/kit/inputs/ModeToggle.tsx
 * @internal
 */

import { expect, test } from "@playwright/test";

test("ModeToggle dropdown sets theme and keeps trigger width stable", async ({
  page,
}) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /select theme/i });
  await expect(trigger).toBeVisible();

  const w1 = (await trigger.boundingBox())?.width ?? 0;

  await trigger.click();
  await page.getByRole("menuitem", { name: /dark/i }).click();

  // Theme class applied and persisted
  await expect(async () => {
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark")
    );
    expect(isDark).toBe(true);
  }).toPass();

  await page.reload();
  const persisted = await page.evaluate(() =>
    document.documentElement.classList.contains("dark")
  );
  expect(persisted).toBe(true);

  const w2 = (await trigger.boundingBox())?.width ?? 0;
  expect(Math.abs(w2 - w1)).toBeLessThanOrEqual(1); // no label-induced layout shift
});
