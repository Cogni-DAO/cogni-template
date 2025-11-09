// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/helpers/instrumentHtmlClass`
 * Purpose: Browser instrumentation for tracking HTML class mutations during page load.
 * Scope: Sets up MutationObserver for <html> class changes and counter. Does not affect page functionality.
 * Invariants: Counts class attribute changes on documentElement; initializes counter to 0.
 * Side-effects: global (modifies window.__classChangeCount__, adds MutationObserver)
 * Notes: Used by theme FOUC prevention tests to detect class thrashing.
 * Links: e2e/types/global.d.ts
 * @internal
 */

import "../types/global.d.ts";

export function instrumentHtmlClass(): void {
  window.__classChangeCount__ = 0;
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (
        m.type === "attributes" &&
        m.attributeName === "class" &&
        m.target === document.documentElement
      ) {
        window.__classChangeCount__++;
      }
    }
  });
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}
