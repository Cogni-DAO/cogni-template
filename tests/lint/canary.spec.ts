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

  it("styles layer allows literals and enforces CVA variant extraction", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile("src/styles/ui.ts");
    const rules = cfg.rules ?? {};

    // literals allowed in styles
    expect(rules["no-literal-classnames/no-literal-classnames"]?.[0]).toBe(0);

    // CVA inline variant maps forbidden
    const nrs = rules["no-restricted-syntax"];
    const sev = Array.isArray(nrs) ? nrs[0] : nrs;
    expect(sev).toBe(2);

    // optional: assert selector/message to catch drift
    const opt = Array.isArray(nrs) ? (nrs[1]?.[0] ?? nrs[1]) : undefined;
    expect(opt?.selector).toContain("CallExpression[callee.name='cva']");
    expect(opt?.message).toContain("Define variant maps");
  });

  it("theme.ts uses styles policy", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile("src/styles/theme.ts");
    const rules = cfg.rules ?? {};
    expect(rules["no-literal-classnames/no-literal-classnames"]?.[0]).toBe(0);
    const nrs = rules["no-restricted-syntax"];
    expect(Array.isArray(nrs) ? nrs[0] : nrs).toBe(2);
  });

  it("kit layer blocks literals", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile(
      "src/components/kit/Button.tsx"
    );
    const rules = cfg.rules ?? {};
    expect(rules["no-literal-classnames/no-literal-classnames"]?.[0]).toBe(2);
  });

  it.skip("no-raw-tailwind rule enforced in source files", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile(
      "src/components/kit/Button.tsx"
    );
    const rules = cfg.rules ?? {};

    expect(
      rules["no-raw-tailwind/no-raw-tailwind-classes"]?.[0] ??
        rules["no-raw-tailwind/no-raw-tailwind-classes"]
    ).toBe(2); // error (currently warn=1, so this will fail until we enforce)
  });
});
