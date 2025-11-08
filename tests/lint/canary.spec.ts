// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/canary`
 * Purpose: Verifies core ESLint policy enforcement across layers stays active.
 * Scope: Covers rule activation for features, kit, styles layers. Does NOT test rule logic.
 * Invariants: Core policies must be enabled; no config drift; layer overrides work.
 * Side-effects: none
 * Notes: Smoke tests to catch ESLint config regressions quickly.
 * Links: eslint.config.mjs, tests/lint/eslint/*.spec.ts
 * @public
 */

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("ESLint Config Canary", () => {
  it("core policy stays enforced for features files", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile(
      "src/features/home/components/X.tsx"
    );
    const rules = cfg.rules ?? {};

    expect(
      rules["no-restricted-syntax"]?.[0] ?? rules["no-restricted-syntax"]
    ).toBe(2); // error
    expect(
      rules["import/no-internal-modules"]?.[0] ??
        rules["import/no-internal-modules"]
    ).toBe(2); // error
    expect(
      rules["boundaries/element-types"]?.[0] ??
        rules["boundaries/element-types"]
    ).toBe(2); // error
  });

  it("className rules enforced in kit components", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile(
      "src/components/kit/Button.tsx"
    );
    const rules = cfg.rules ?? {};

    expect(
      rules["no-literal-classnames/no-literal-classnames"]?.[0] ??
        rules["no-literal-classnames/no-literal-classnames"]
    ).toBe(2); // error
    expect(
      rules["no-restricted-syntax"]?.[0] ?? rules["no-restricted-syntax"]
    ).toBe(2); // error
  });

  it("styles layer allows literals", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile("src/styles/ui.ts");
    const rules = cfg.rules ?? {};

    expect(
      rules["no-literal-classnames/no-literal-classnames"]?.[0] ??
        rules["no-literal-classnames/no-literal-classnames"]
    ).toBe(0); // off - allows literals
    expect(
      rules["no-restricted-syntax"]?.[0] ?? rules["no-restricted-syntax"]
    ).toBe(0); // off - allows literals
  });
});
