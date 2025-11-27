// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/process-env`
 * Purpose: Confirms the linter rule enforces /env is the only place that can access/load process.env.
 * Scope: Covers process.env blocking in app/component files and allowlisting only in env modules. Does not test other ESLint rules.
 * Invariants: process.env usage forbidden except in src/shared/env/; infrastructure files allowed for testing/config only.
 * Side-effects: IO (via lintFixture temp file creation)
 * Notes: Uses real ESLint with patched config; validates centralized environment variable access pattern.
 * Links: eslint/base.config.mjs, src/shared/env/, tests/lint/eslint/runEslint.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runEslint";

// Migrated to Biome (Commit 3) - see tests/lint/biome/process-env.spec.ts
describe.skip("n/no-process-env rule", () => {
  it("should block process.env in regular app files", async () => {
    const result = await lintFixture(
      "src/app/page.tsx",
      `export default function Page() {
  const env = process.env.NODE_ENV;
  return <div>{env}</div>;
}`
    );

    expect(result.messages.some((m) => m.ruleId === "n/no-process-env")).toBe(
      true
    );
    const processEnvError = result.messages.find(
      (m) => m.ruleId === "n/no-process-env"
    );
    expect(processEnvError?.message).toContain("Unexpected use of process.env");
  });

  it("should block process.env in component files", async () => {
    const result = await lintFixture(
      "src/components/MyComponent.tsx",
      `export function MyComponent() {
  if (process.env.NODE_ENV === 'development') {
    console.log('dev mode');
  }
  return null;
}`
    );

    expect(result.messages.some((m) => m.ruleId === "n/no-process-env")).toBe(
      true
    );
    const processEnvError = result.messages.find(
      (m) => m.ruleId === "n/no-process-env"
    );
    expect(processEnvError?.message).toContain("Unexpected use of process.env");
  });

  it("should allow process.env in environment files", async () => {
    const result = await lintFixture(
      "src/shared/env/server.ts",
      `export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
};`
    );

    expect(result.messages).toHaveLength(0);
  });

  it("should allow process.env in client env files", async () => {
    const result = await lintFixture(
      "src/shared/env/client.ts",
      `export const clientConfig = {
  publicKey: process.env.NEXT_PUBLIC_API_KEY,
};`
    );

    expect(result.messages).toHaveLength(0);
  });

  it("should allow process.env in playwright config", async () => {
    const result = await lintFixture(
      "playwright.config.ts",
      `export default {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
};`
    );

    expect(
      result.messages.filter((m) => m.ruleId === "n/no-process-env")
    ).toHaveLength(0);
  });

  it("should allow process.env in e2e helper files", async () => {
    const result = await lintFixture(
      "e2e/helpers/setup.ts",
      `export const testConfig = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
};`
    );

    expect(result.messages).toHaveLength(0);
  });

  it("should allow process.env in scripts", async () => {
    const result = await lintFixture(
      "scripts/build-check.ts",
      `if (process.env.CI) {
  console.log('Running in CI');
}`
    );

    expect(result.messages).toHaveLength(0);
  });

  it("should allow process.env in docs templates", async () => {
    const result = await lintFixture(
      "docs/templates/header_test_template.ts",
      `export const template = process.env.TEMPLATE_VAR || 'default';`
    );

    expect(result.messages).toHaveLength(0);
  });
});
