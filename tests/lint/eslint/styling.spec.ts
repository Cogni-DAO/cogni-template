// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("CVA-Only Styling Policy", () => {
  it("blocks direct literal className", async () => {
    const { errors } = await lintFixture(
      "src/app/page.tsx",
      `export default () => <div className="flex gap-2" />;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it("blocks cn() with literals", async () => {
    const { errors } = await lintFixture(
      "src/app/page.tsx",
      `import { cn } from "clsx"; export default () => <div className={cn("flex","gap-2")} />;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it("allows CVA usage in kit", async () => {
    const { errors } = await lintFixture(
      "src/components/kit/inputs/Button.tsx",
      `import { button } from "@/styles/ui"; export const Button = () => <button className={button({variant:"primary"})} />;`
    );
    expect(errors).toBe(0);
  });

  it("allows literals in styles definitions", async () => {
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
