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
  const severity = (value: unknown): unknown =>
    Array.isArray(value) ? value[0] : value;
  const expectError = (rule: unknown): void =>
    expect(["error", 2]).toContain(severity(rule));
  const expectOff = (rule: unknown): void =>
    expect(["off", 0]).toContain(severity(rule));

  it("core policy + UI governance stay enforced for features files", async (): Promise<void> => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile(
      "src/features/home/components/X.tsx"
    );
    const rules = cfg.rules ?? {};

    expectError(rules["ui-governance/no-raw-colors"]);
    expectError(rules["ui-governance/no-arbitrary-non-token-values"]);
    expectError(rules["ui-governance/token-classname-patterns"]);
    expectError(rules["ui-governance/no-vendor-imports-outside-kit"]);
    expect(severity(rules["import/no-internal-modules"])).toBe(2);
    expect(severity(rules["boundaries/element-types"])).toBe(2);
  });

  it("kit layer inherits UI governance rules", async (): Promise<void> => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile(
      "src/components/kit/inputs/Button.tsx"
    );
    const rules = cfg.rules ?? {};

    expectError(rules["ui-governance/no-raw-colors"]);
    expectError(rules["ui-governance/no-arbitrary-non-token-values"]);
    expectError(rules["ui-governance/token-classname-patterns"]);
    expectError(rules["ui-governance/no-vendor-imports-outside-kit"]);
  });

  it("styles layer exempts UI governance but keeps CVA guard", async (): Promise<void> => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile("src/styles/ui.ts");
    const rules = cfg.rules ?? {};

    expectOff(rules["ui-governance/no-raw-colors"]);
    expectOff(rules["ui-governance/no-arbitrary-non-token-values"]);
    expectOff(rules["ui-governance/token-classname-patterns"]);
    expectOff(rules["ui-governance/no-vendor-imports-outside-kit"]);

    const nrs = rules["no-restricted-syntax"];
    const sev = Array.isArray(nrs) ? nrs[0] : nrs;
    expect(sev).toBe(2);

    // optional: assert selector/message to catch drift
    const opt = Array.isArray(nrs) ? (nrs[1]?.[0] ?? nrs[1]) : undefined;
    expect(opt?.selector).toContain("CallExpression[callee.name='cva']");
    expect(opt?.message).toContain("Define variant maps");
  });

  it("theme.ts follows styles exemptions + CVA guard", async (): Promise<void> => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const cfg = await eslint.calculateConfigForFile("src/styles/theme.ts");
    const rules = cfg.rules ?? {};

    expectOff(rules["ui-governance/no-raw-colors"]);
    expectOff(rules["ui-governance/no-arbitrary-non-token-values"]);
    expectOff(rules["ui-governance/token-classname-patterns"]);
    expectOff(rules["ui-governance/no-vendor-imports-outside-kit"]);

    const nrs = rules["no-restricted-syntax"];
    expect(Array.isArray(nrs) ? nrs[0] : nrs).toBe(2);
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
