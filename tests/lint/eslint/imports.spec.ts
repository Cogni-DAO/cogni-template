// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

describe("Features Import Boundaries", () => {
  it("allows feature importing components", async () => {
    const { errors } = await lintFixture(
      "src/features/home/components/Terminal.tsx",
      `import { Button } from "@/components"; export const Terminal = () => <Button />;`
    );
    expect(errors).toBe(0);
  });

  it.skip("blocks feature importing styles directly", async () => {
    const { errors } = await lintFixture(
      "src/features/auth/components/LoginForm.tsx",
      `import { button } from "@/styles/ui"; export const LoginForm = () => <div className={button()} />;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it.skip("blocks cross-feature imports", async () => {
    const { errors } = await lintFixture(
      "src/features/auth/components/LoginForm.tsx",
      `import { Terminal } from "@/features/home/components/Terminal"; export default Terminal;`
    );
    expect(errors).toBeGreaterThan(0);
  });

  it.skip("blocks parent-relative imports", async () => {
    const { errors } = await lintFixture(
      "src/features/auth/components/LoginForm.tsx",
      `import { utils } from "../../../shared/util"; export default utils;`
    );
    expect(errors).toBeGreaterThan(0);
  });
});
