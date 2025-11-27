// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/biome/process-env`
 * Purpose: Confirms the linter rule enforces /env is the only place that can access/load process.env.
 * Scope: Covers process.env blocking in app/component files and allowlisting only in env modules. Does not test other Biome rules.
 * Invariants: process.env usage forbidden except in src/shared/env/; infrastructure files allowed for testing/config only.
 * Side-effects: IO (via lintFixture temp file creation)
 * Notes: Uses real Biome with live config; validates centralized environment variable access pattern.
 * Links: biome/base.json, src/shared/env/, tests/lint/biome/runBiome.ts
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

describe("lint/style/noProcessEnv rule", () => {
  it("should block process.env in regular app files", async () => {
    const result = await lintFixture(
      "app/page.tsx",
      `export default function Page() {
  const env = process.env.NODE_ENV;
  return <div>{env}</div>;
}`,
      { virtualRepoPath: "src/app/__biome_test__/page.tsx" }
    );

    expect(
      result.messages.some((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toBe(true);
  });

  it("should block process.env in component files", async () => {
    const result = await lintFixture(
      "components/MyComponent.tsx",
      `export function MyComponent() {
  if (process.env.NODE_ENV === 'development') {
    console.log('dev mode');
  }
  return null;
}`,
      { virtualRepoPath: "src/components/__biome_test__/MyComponent.tsx" }
    );

    expect(
      result.messages.some((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toBe(true);
  });

  it("should allow process.env in environment files", async () => {
    const result = await lintFixture(
      "shared/env/server.ts",
      `export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
};`,
      { virtualRepoPath: "src/shared/env/__biome_test__/server.ts" }
    );

    expect(
      result.messages.filter((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toHaveLength(0);
  });

  it("should allow process.env in client env files", async () => {
    const result = await lintFixture(
      "shared/env/client.ts",
      `export const clientConfig = {
  publicKey: process.env.NEXT_PUBLIC_API_KEY,
};`,
      { virtualRepoPath: "src/shared/env/__biome_test__/client.ts" }
    );

    expect(
      result.messages.filter((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toHaveLength(0);
  });

  it("should allow process.env in playwright config", async () => {
    const result = await lintFixture(
      "playwright.config.ts",
      `export default {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
};`,
      { virtualRepoPath: "__biome_test__/playwright.config.ts" }
    );

    expect(
      result.messages.filter((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toHaveLength(0);
  });

  it("should allow process.env in e2e helper files", async () => {
    const result = await lintFixture(
      "e2e/helpers/setup.ts",
      `export const testConfig = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
};`,
      { virtualRepoPath: "e2e/__biome_test__/helpers/setup.ts" }
    );

    expect(
      result.messages.filter((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toHaveLength(0);
  });

  it("should allow process.env in scripts", async () => {
    const result = await lintFixture(
      "scripts/build-check.ts",
      `if (process.env.CI) {
  console.log('Running in CI');
}`,
      { virtualRepoPath: "scripts/__biome_test__/build-check.ts" }
    );

    expect(
      result.messages.filter((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toHaveLength(0);
  });

  it("should allow process.env in docs templates", async () => {
    const result = await lintFixture(
      "docs/templates/header_test_template.ts",
      `export const template = process.env.TEMPLATE_VAR || 'default';`,
      {
        virtualRepoPath:
          "docs/templates/__biome_test__/header_test_template.ts",
      }
    );

    expect(
      result.messages.filter((m) => m.ruleId === "lint/style/noProcessEnv")
    ).toHaveLength(0);
  });
});
