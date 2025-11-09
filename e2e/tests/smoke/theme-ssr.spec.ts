// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/smoke/theme-ssr`
 * Purpose: Prevents FOUC by validating theme class exists before React hydration.
 * Scope: Tests SSR theme initialization and DOM mutation counting. Does not test user interactions.
 * Invariants: HTML has light/dark class on first paint; ≤1 class changes during startup; no hydration warnings.
 * Side-effects: IO, time, global
 * Notes: Uses MutationObserver to count class changes during startup.
 * Links: public/theme-init.js, src/app/layout.tsx
 * @internal
 */

import "../../types/global.d.ts";

import { expect, test } from "@playwright/test";

import { instrumentHtmlClass } from "../../helpers/instrumentHtmlClass";

test("SSR sets theme class and no hydration warnings", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) warnings.push(m.text());
  });

  await page.addInitScript(instrumentHtmlClass);

  const res = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);

  // Theme class must be present on first paint.
  const htmlClass = await page.locator("html").getAttribute("class");
  expect(htmlClass ?? "").toMatch(/\b(light|dark)\b/);

  // No hydration mismatch warnings.
  expect(warnings.join("\n")).not.toMatch(
    /hydration|did not match|content mismatch/i
  );

  // Class should not thrash. Allow 1 change max during start.
  const flips = await page.evaluate(() => window.__classChangeCount__ ?? 0);
  expect(flips).toBeLessThanOrEqual(1);
});
