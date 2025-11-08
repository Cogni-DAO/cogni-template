// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

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
