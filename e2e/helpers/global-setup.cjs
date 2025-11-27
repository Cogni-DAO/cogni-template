// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/helpers/global-setup.cjs`
 * Purpose: CommonJS wrapper for Playwright globalSetup (bridges Playwright's default export requirement with TypeScript named exports).
 * Scope: Re-exports globalSetup function from TS module; used by playwright.config.ts. Does not perform setup logic itself.
 * Invariants: Must re-export a single function that matches Playwright's globalSetup signature.
 * Side-effects: none
 * Links: global-setup.ts, playwright.config.ts
 * @internal
 */

const { globalSetup } = require("./global-setup");
module.exports = globalSetup;
