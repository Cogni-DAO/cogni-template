// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `vitest.workspace`
 * Purpose: Vitest workspace configuration for monorepo test discovery.
 * Scope: Discovers package-local vitest configs and root test config.
 * Invariants:
 *   - Package tests in packages/<pkg>/tests/** only import that package
 *   - Cross-package integration tests in tests/packages/** may import multiple packages
 * Side-effects: none
 * Links: packages/&lt;pkg&gt;/vitest.config.ts, vitest.config.mts
 * @public
 */

import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  // Root tests (tests/**)
  "./vitest.config.mts",
  // Package-local tests
  "./packages/*/vitest.config.ts",
  // Service-local tests
  "./services/*/vitest.config.ts",
]);
