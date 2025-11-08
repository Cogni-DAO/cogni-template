// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Vendor & Styles Exemptions", () => {
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
