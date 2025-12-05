// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/ai.models.v1.contract`
 * Purpose: Validates models list fixture matches ai.models.v1 contract schema.
 * Scope: Tests Zod schema compliance for models list response. Does not test API endpoint behavior or caching logic.
 * Invariants: Fixture must parse via contract schema without errors; all required fields present.
 * Side-effects: none
 * Notes: Prevents contract drift between fixture and production schema.
 * Links: @/contracts/ai.models.v1.contract, @tests/_fixtures/ai/models.response.json
 * @internal
 */

import { loadModelsFixture } from "@tests/_fixtures/ai/fixtures";
import { describe, expect, it } from "vitest";
import { aiModelsOperation } from "@/contracts/ai.models.v1.contract";

describe("ai.models.v1 contract validation", () => {
  it("should parse fixture via contract schema without errors", () => {
    // Arrange
    const fixture = loadModelsFixture();

    // Act & Assert - Parse should not throw
    expect(() => aiModelsOperation.output.parse(fixture)).not.toThrow();
  });

  it("should have required top-level fields", () => {
    // Arrange
    const fixture = loadModelsFixture();

    // Assert
    expect(fixture).toHaveProperty("models");
    expect(fixture).toHaveProperty("defaultPreferredModelId");
    expect(fixture).toHaveProperty("defaultFreeModelId");
    // Defaults are nullable - fixture has defaults from JSON
    expect(fixture.defaultPreferredModelId).toBeTruthy();
    expect(typeof fixture.defaultPreferredModelId).toBe("string");
    if (fixture.defaultPreferredModelId !== null) {
      expect(fixture.defaultPreferredModelId.length).toBeGreaterThan(0);
    }
  });

  it("should have non-empty models array", () => {
    // Arrange
    const fixture = loadModelsFixture();

    // Assert
    expect(Array.isArray(fixture.models)).toBe(true);
    expect(fixture.models.length).toBeGreaterThan(0);
  });

  it("should have required fields on each model", () => {
    // Arrange
    const fixture = loadModelsFixture();

    // Assert - Each model has id and isFree
    for (const model of fixture.models) {
      expect(model).toHaveProperty("id");
      expect(model).toHaveProperty("isFree");
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
      expect(typeof model.isFree).toBe("boolean");
    }
  });

  it("should have both free and paid models", () => {
    // Arrange
    const fixture = loadModelsFixture();

    // Assert - At least one free and one paid
    const hasFreeModel = fixture.models.some((m) => m.isFree === true);
    const hasPaidModel = fixture.models.some((m) => m.isFree === false);

    expect(hasFreeModel).toBe(true);
    expect(hasPaidModel).toBe(true);
  });

  it("should have defaultPreferredModelId that exists in models list", () => {
    // Arrange
    const fixture = loadModelsFixture();

    // Assert - defaultPreferredModelId is in the models array
    const modelIds = fixture.models.map((m) => m.id);
    expect(modelIds).toContain(fixture.defaultPreferredModelId);
  });
});
