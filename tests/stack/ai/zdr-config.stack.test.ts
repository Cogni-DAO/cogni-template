// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/ai/zdr-config.stack`
 * Purpose: Verify ZDR (Zero Data Retention) configuration in litellm.config.yaml
 * Scope: Config smoke test - parses YAML and asserts ZDR flag presence. Does not test runtime behavior or adapter wiring.
 * Invariants: ZDR-enabled models must have extra_body.provider.zdr === true in config.
 * Side-effects: none (reads config file only)
 * Notes: Runs in APP_ENV=test (no docker/adapters needed). Guards against config regressions.
 * Links: platform/infra/services/runtime/configs/litellm.config.yaml
 * @public
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "yaml";

const LITELLM_CONFIG_PATH = path.join(
  process.cwd(),
  "platform/infra/services/runtime/configs/litellm.config.yaml"
);

describe("ZDR Configuration", () => {
  it("ZDR-enabled models have provider.zdr=true in config", () => {
    // Read and parse litellm config
    const configContent = fs.readFileSync(LITELLM_CONFIG_PATH, "utf-8");
    const config = yaml.parse(configContent);

    expect(config).toHaveProperty("model_list");
    expect(Array.isArray(config.model_list)).toBe(true);

    // Find ZDR-enabled models (Anthropic Claude models)
    const claudeSonnet = config.model_list.find(
      (m: { model_name: string }) => m.model_name === "claude-sonnet-4.5"
    );
    const claudeOpus = config.model_list.find(
      (m: { model_name: string }) => m.model_name === "claude-opus-4.5"
    );

    // Assert both Claude models exist
    expect(claudeSonnet).toBeDefined();
    expect(claudeOpus).toBeDefined();

    // Assert ZDR flag is present and true
    expect(claudeSonnet?.litellm_params?.extra_body?.provider?.zdr).toBe(true);
    expect(claudeOpus?.litellm_params?.extra_body?.provider?.zdr).toBe(true);
  });

  it("Non-ZDR models do NOT have provider.zdr flag", () => {
    // Read and parse litellm config
    const configContent = fs.readFileSync(LITELLM_CONFIG_PATH, "utf-8");
    const config = yaml.parse(configContent);

    // Find non-ZDR models (OpenAI, Google, etc.)
    const gpt5Nano = config.model_list.find(
      (m: { model_name: string }) => m.model_name === "gpt-5-nano"
    );
    const geminiFlash = config.model_list.find(
      (m: { model_name: string }) => m.model_name === "gemini-2.5-flash"
    );

    expect(gpt5Nano).toBeDefined();
    expect(geminiFlash).toBeDefined();

    // Assert ZDR flag is NOT present
    expect(gpt5Nano?.litellm_params?.extra_body?.provider?.zdr).toBeUndefined();
    expect(
      geminiFlash?.litellm_params?.extra_body?.provider?.zdr
    ).toBeUndefined();
  });
});
