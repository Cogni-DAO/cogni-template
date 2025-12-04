// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fixtures/ai/fixtures`
 * Purpose: Provides fixture loader for AI test data including models list response.
 * Scope: Loads and types static JSON fixtures for test consistency. Does not implement test logic or assertions.
 * Invariants: Returns typed data matching contract schemas. Fixtures are static; tests stub env vars.
 * Side-effects: none
 * Notes: Single source of truth for models list in all tests. Use vi.stubEnv('DEFAULT_MODEL') in tests.
 * Links: models.response.json, @/contracts/ai.models.v1.contract
 * @internal
 */

import type { ModelsOutput } from "@/contracts/ai.models.v1.contract";
import { aiModelsOperation } from "@/contracts/ai.models.v1.contract";
import type { ModelsCatalog } from "@/shared/ai/model-catalog.server";
import modelsFixture from "./models.response.json";

/**
 * Load canonical models list fixture (static JSON)
 * @returns ModelsOutput with 7 models (5 free, 2 paid) and static defaultModelId
 * @throws If fixture doesn't match contract schema (catches drift early)
 */
export function loadModelsFixture(): ModelsOutput {
  // Validate via contract instead of casting - ensures test data matches production schema
  return aiModelsOperation.output.parse(modelsFixture);
}

/**
 * Load models catalog for mocking getCachedModels (no defaultModelId field)
 * @returns ModelsCatalog with just models array
 */
export function loadModelsCatalogFixture(): ModelsCatalog {
  return {
    models: modelsFixture.models,
    defaultModelId: modelsFixture.defaultModelId,
  };
}
