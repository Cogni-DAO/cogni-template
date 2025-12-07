// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fixtures/ai/fixtures`
 * Purpose: Provides fixture loader for AI test data including models list response.
 * Scope: Loads and types static JSON fixtures for test consistency. Does not implement test logic or assertions.
 * Invariants: Returns typed data matching contract schemas. Fixtures are static.
 * Side-effects: none
 * Notes: Single source of truth for models list in all tests. Defaults computed from catalog metadata.cogni.* tags.
 * Links: models.response.json, @/contracts/ai.models.v1.contract
 * @internal
 */

import type { ModelsOutput } from "@/contracts/ai.models.v1.contract";
import { aiModelsOperation } from "@/contracts/ai.models.v1.contract";
import type { ModelsCatalog } from "@/shared/ai/model-catalog.server";
import modelsFixture from "./models.response.json";

/**
 * Load canonical models list fixture (static JSON)
 * @returns ModelsOutput with 7 models (5 free, 2 paid) and defaults
 * @throws If fixture doesn't match contract schema (catches drift early)
 */
export function loadModelsFixture(): ModelsOutput {
  // Validate via contract instead of casting - ensures test data matches production schema
  return aiModelsOperation.output.parse(modelsFixture);
}

/**
 * Load models catalog for mocking getCachedModels (no defaults set - simulates untagged catalog)
 * Uses deterministic fallback for defaults (first by id)
 * @returns ModelsCatalog with models array and computed defaults
 */
export function loadModelsCatalogFixture(): ModelsCatalog {
  // Sort by id for deterministic fallback
  const sorted = [...modelsFixture.models].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const paidModels = sorted.filter((m) => !m.isFree);
  const freeModels = sorted.filter((m) => m.isFree);

  return {
    models: modelsFixture.models,
    defaults: {
      // Deterministic fallback: first paid or first overall
      defaultPreferredModelId: paidModels[0]?.id ?? sorted[0]?.id ?? null,
      // First free model
      defaultFreeModelId: freeModels[0]?.id ?? null,
    },
  };
}

/**
 * Load models catalog with explicit default tags (simulates properly configured catalog)
 * @returns ModelsCatalog with models array and tagged defaults from fixture
 */
export function loadModelsCatalogWithDefaultsFixture(): ModelsCatalog {
  return {
    models: modelsFixture.models.map((m) => ({
      ...m,
      // Add cogni metadata for tagged defaults
      cogni:
        m.id === modelsFixture.defaultPreferredModelId
          ? { defaultPreferred: true }
          : m.id === modelsFixture.defaultFreeModelId
            ? { defaultFree: true }
            : undefined,
    })),
    defaults: {
      defaultPreferredModelId: modelsFixture.defaultPreferredModelId,
      defaultFreeModelId: modelsFixture.defaultFreeModelId,
    },
  };
}

/**
 * Create models response with both free and paid models
 * @returns ModelsOutput for testing credit-based model selection
 */
export function createModelsWithFree(): ModelsOutput {
  return {
    models: [
      { id: "free-model-123", name: "Free Model", isFree: true, isZdr: false },
      { id: "paid-model-456", name: "Paid Model", isFree: false, isZdr: false },
    ],
    defaultPreferredModelId: "paid-model-456",
    defaultFreeModelId: "free-model-123",
  };
}

/**
 * Create models response with only paid models (no free models available)
 * @returns ModelsOutput for testing blocked state when user has zero credits
 */
export function createModelsPaidOnly(): ModelsOutput {
  return {
    models: [
      { id: "gpt-5-nano", name: "GPT-5 Nano", isFree: false, isZdr: false },
    ],
    defaultPreferredModelId: "gpt-5-nano",
    defaultFreeModelId: null,
  };
}

/**
 * Create models response with only Claude models (no OpenAI)
 * @returns ModelsOutput for testing that UI doesn't invent model IDs
 */
export function createModelsClaudeOnly(): ModelsOutput {
  return {
    models: [
      {
        id: "claude-haiku-free",
        name: "Claude Haiku",
        isFree: true,
        isZdr: false,
      },
      {
        id: "claude-sonnet-paid",
        name: "Claude Sonnet",
        isFree: false,
        isZdr: true,
      },
    ],
    defaultPreferredModelId: "claude-sonnet-paid",
    defaultFreeModelId: "claude-haiku-free",
  };
}

/**
 * Create models response with multiple free models
 * @returns ModelsOutput for testing user choice preservation
 */
export function createModelsMultipleFree(): ModelsOutput {
  return {
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini", isFree: true, isZdr: false },
      { id: "claude-haiku", name: "Claude Haiku", isFree: true, isZdr: false },
      { id: "gpt-5-nano", name: "GPT-5 Nano", isFree: false, isZdr: false },
    ],
    defaultPreferredModelId: "gpt-5-nano",
    defaultFreeModelId: "gpt-4o-mini",
  };
}
