// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/vendor`
 * Purpose: Verifies vendor and styles layers have proper exemptions from styling rules.
 * Scope: Covers vendor literal classes, styles imports. Does NOT test vendor boundaries.
 * Invariants: Vendor/styles exempt from className restrictions; other rules still apply.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests layer-specific rule overrides in eslint.config.mjs.
 * Links: eslint.config.mjs vendor/styles overrides, src/components/vendor/
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

// TODO: Migrate to Biome - waiting for corresponding commit
// TODO: Migrate to Biome - waiting for corresponding commit

describe.skip("Vendor & Styles Exemptions", () => {
  it("allows vendor literal classes", async () => {
    const { errors } = await lintFixture(
      "src/components/vendor/ui-primitives/shadcn/button.tsx",
      `export const Button = () => <button className="flex gap-2 items-center" />;`
    );
    expect(errors).toBe(0);
  });

  it.skip("blocks vendor forbidden repo imports", async () => {
    const { errors } = await lintFixture(
      "src/components/vendor/ui-primitives/shadcn/button.tsx",
      `import { internalUtil } from "@/shared/internal"; export default internalUtil;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it("allows styles layer literals and external imports", async () => {
    const { errors } = await lintFixture(
      "src/styles/ui/index.ts",
      `import { cva } from "class-variance-authority"; export const button = cva("flex gap-2");`,
      {
        ignoreRules: ["import/no-unresolved", "node/no-missing-import"],
        focusRulePrefixes: ["no-restricted-syntax"],
      }
    );
    expect(errors).toBe(0);
  });
});
