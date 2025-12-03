// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fixtures/ai/fixtures`
 * Purpose: Provides fixture loader for AI test data including models list response.
 * Scope: Loads and types static JSON fixtures for test consistency. Does not implement test logic or assertions.
 * Invariants: Returns typed data matching contract schemas.
 * Side-effects: none
 * Notes: Single source of truth for models list in all tests.
 * Links: models.response.json, @/contracts/ai.models.v1.contract
 * @internal
 */

import {
  aiModelsOperation,
  type ModelsOutput,
} from "@/contracts/ai.models.v1.contract";
import modelsFixture from "./models.response.json";

/**
 * Load canonical models list fixture
 * @returns ModelsOutput with 5 models (3 free, 2 paid) and defaultModelId
 * @throws If fixture doesn't match contract schema (catches drift early)
 */
export function loadModelsFixture(): ModelsOutput {
  // Validate via contract instead of casting - ensures test data matches production schema
  return aiModelsOperation.output.parse(modelsFixture);
}
