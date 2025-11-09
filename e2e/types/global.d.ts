// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@e2e/types/global`
 * Purpose: TypeScript global augmentations for E2E test browser globals.
 * Scope: Augments Window interface with test instrumentation properties. Does not affect runtime.
 * Invariants: Window interface includes test-specific properties; compatible with Playwright types.
 * Side-effects: none
 * Notes: Standard TS augmentation pattern for browser globals in Playwright tests.
 * Links: tsconfig.json, Playwright global types
 * @internal
 */

export {};

declare global {
  interface Window {
    __classChangeCount__: number;
  }
}