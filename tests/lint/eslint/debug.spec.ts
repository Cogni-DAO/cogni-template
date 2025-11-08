// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Debug ESLint", () => {
  it("debug simple case", async () => {
    const result = await lintFixture(
      "src/features/home/components/X.tsx",
      `import { Button } from "@/components"; export const X = () => <Button />;`
    );

    console.log("Result:", JSON.stringify(result, null, 2));

    // Let's see what errors we get
    expect(result.errors).toBeDefined();
  });
});
