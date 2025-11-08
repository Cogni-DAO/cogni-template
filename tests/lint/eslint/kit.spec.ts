// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/kit`
 * Purpose: Verifies kit component purity rules forbid className usage completely.
 * Scope: Covers className prop forwarding and literal usage. Does NOT test other kit rules.
 * Invariants: Kit components must use CVA only; no className anywhere in kit layer.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests the strict no-restricted-syntax rule blocking Identifier[name='className'].
 * Links: eslint.config.mjs kit layer rules, src/components/kit/
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Kit Layer Purity", () => {
  it("blocks kit forwarding className", async () => {
    const { errors } = await lintFixture(
      "src/components/kit/layout/Container.tsx",
      `export const Container = ({ className }: { className?: string }) => <div className={className} />;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it("blocks kit using literal classes", async () => {
    const { errors } = await lintFixture(
      "src/components/kit/layout/Container.tsx",
      `export const Container = () => <div className="p-4" />;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it("allows kit using CVA", async () => {
    const { errors } = await lintFixture(
      "src/components/kit/layout/Container.tsx",
      `import { container } from "@/styles/ui"; export const Container = () => <div className={container({size:"lg"})} />;`
    );
    expect(errors).toBe(0);
  });
});
