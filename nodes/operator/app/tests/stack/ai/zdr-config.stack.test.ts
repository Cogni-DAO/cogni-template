// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/ai/zdr-config.stack`
 * Purpose: Verify ZDR (Zero Data Retention) configuration in litellm.config.yaml
 * Scope: Config smoke test - parses YAML and asserts ZDR flag presence. Does not test runtime behavior or adapter wiring.
 * Invariants: ZDR-enabled models must have extra_body.provider.zdr === true in config.
 * Side-effects: none (reads config file only)
 * Notes: Runs in APP_ENV=test (no docker/adapters needed). Guards against config regressions.
 * Links: infra/compose/runtime/configs/litellm.config.yaml, https://openrouter.ai/docs/guides/features/zdr#per-request-zdr-enforcement
 * @public
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "yaml";

const LITELLM_CONFIG_PATH = path.join(
  process.cwd(),
  "infra/compose/runtime/configs/litellm.config.yaml"
);

type LiteLLMModel = {
  model_name: string;
  litellm_params?: { extra_body?: { provider?: { zdr?: boolean } } };
  model_info?: { is_zdr?: boolean };
};

function loadModelList(): LiteLLMModel[] {
  const configContent = fs.readFileSync(LITELLM_CONFIG_PATH, "utf-8");
  const config = yaml.parse(configContent);
  expect(config).toHaveProperty("model_list");
  expect(Array.isArray(config.model_list)).toBe(true);
  return config.model_list as LiteLLMModel[];
}

describe("ZDR Configuration", () => {
  // Config-driven: assert the invariant across whatever models exist, so a
  // roster refresh (models added/removed) can't silently break the ZDR contract.
  it("is_zdr models have provider.zdr=true; the two must agree", () => {
    const models = loadModelList();

    const zdrModels = models.filter((m) => m.model_info?.is_zdr === true);
    // Guard: at least one ZDR model is configured (regression catch).
    expect(zdrModels.length).toBeGreaterThan(0);

    for (const m of zdrModels) {
      expect(
        m.litellm_params?.extra_body?.provider?.zdr,
        `${m.model_name}: is_zdr=true requires extra_body.provider.zdr=true`
      ).toBe(true);
    }
  });

  it("non-ZDR models do NOT carry a provider.zdr flag", () => {
    const models = loadModelList();

    const nonZdrModels = models.filter((m) => m.model_info?.is_zdr !== true);
    expect(nonZdrModels.length).toBeGreaterThan(0);

    for (const m of nonZdrModels) {
      expect(
        m.litellm_params?.extra_body?.provider?.zdr,
        `${m.model_name}: non-ZDR model must not set provider.zdr`
      ).toBeUndefined();
    }
  });
});
