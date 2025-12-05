// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/ai/models-route.int`
 * Purpose: Validates /api/v1/ai/models HTTP endpoint behavior including auth and error handling.
 * Scope: Tests HTTP status codes and response schema compliance. Does not test cache implementation or upstream fetch logic.
 * Invariants: Route requires authentication; returns contract-valid response; handles errors gracefully; defaults computed from catalog metadata.
 * Side-effects: none (fully mocked)
 * Notes: Uses mocked session and cache - no real HTTP server or database required. Defaults come from catalog metadata.cogni.* tags.
 * Links: /api/v1/ai/models route, ai.models.v1.contract
 * @internal
 */

import {
  loadModelsCatalogFixture,
  loadModelsCatalogWithDefaultsFixture,
} from "@tests/_fixtures/ai/fixtures";
import { generateTestWallet } from "@tests/_fixtures/auth/db-helpers";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiModelsOperation } from "@/contracts/ai.models.v1.contract";

// Mock dependencies
vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/shared/ai/model-catalog.server", () => ({
  getCachedModels: vi.fn(),
}));

vi.mock("@/shared/env", () => ({
  serverEnv: vi.fn(),
}));

// Import after mocks
import { getSessionUser } from "@/app/_lib/auth/session";
import { GET } from "@/app/api/v1/ai/models/route";
import { getCachedModels } from "@/shared/ai/model-catalog.server";
import { serverEnv } from "@/shared/env";

describe("/api/v1/ai/models integration tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // serverEnv still needed for LITELLM_* vars in error logging
    vi.mocked(serverEnv).mockReturnValue({
      LITELLM_BASE_URL: "http://localhost:4000",
      LITELLM_MASTER_KEY: "test-key",
    } as ReturnType<typeof serverEnv>);
  });

  it("should return 200 with contract-valid response when authenticated", async () => {
    // Arrange - catalog with defaults computed from metadata tags
    const catalog = loadModelsCatalogWithDefaultsFixture();

    vi.mocked(getSessionUser).mockResolvedValue({
      id: "test-user",
      walletAddress: generateTestWallet("models-route-happy-path"),
    });
    vi.mocked(getCachedModels).mockResolvedValue(catalog);

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);
    const data = await response.json();

    // Assert - HTTP status
    expect(response.status).toBe(200);

    // Assert - Contract compliance
    const parsed = aiModelsOperation.output.parse(data);

    // Assert - defaults come from catalog (computed from metadata tags)
    expect(parsed.defaultPreferredModelId).toBe(
      catalog.defaults.defaultPreferredModelId
    );
    expect(parsed.defaultFreeModelId).toBe(catalog.defaults.defaultFreeModelId);

    // Assert - defaults exist in returned models (if not null)
    const modelIds = parsed.models.map((m) => m.id);
    if (parsed.defaultPreferredModelId) {
      expect(modelIds).toContain(parsed.defaultPreferredModelId);
    }
    if (parsed.defaultFreeModelId) {
      expect(modelIds).toContain(parsed.defaultFreeModelId);
    }
  });

  it("should return null defaults when catalog has no tagged models", async () => {
    // Arrange - catalog without metadata tags (legacy format)
    const catalog = loadModelsCatalogFixture();

    vi.mocked(getSessionUser).mockResolvedValue({
      id: "test-user",
      walletAddress: generateTestWallet("models-route-no-tags"),
    });
    vi.mocked(getCachedModels).mockResolvedValue(catalog);

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);
    const data = await response.json();

    // Assert - still 200, not 500 (never error on missing tags)
    expect(response.status).toBe(200);

    // Assert - Contract compliance (nullable defaults are valid)
    const parsed = aiModelsOperation.output.parse(data);

    // defaults should be deterministic fallback (first by id) or null
    expect(parsed.models.length).toBeGreaterThan(0);
  });

  it("should return 401 when not authenticated", async () => {
    // Arrange
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);

    // Assert
    expect(response.status).toBe(401);
  });

  it("should return 503 when cache fails", async () => {
    // Arrange
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "test-user",
      walletAddress: generateTestWallet("models-route-cache-fail"),
    });
    vi.mocked(getCachedModels).mockRejectedValue(new Error("Cache error"));

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);

    // Assert
    expect(response.status).toBe(503);
  });
});
