// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/ai/models-route.int`
 * Purpose: Validates /api/v1/ai/models HTTP endpoint behavior including auth and error handling.
 * Scope: Tests HTTP status codes and response schema compliance. Does not test cache implementation or upstream fetch logic.
 * Invariants: Route requires authentication; returns contract-valid response; handles errors gracefully; DEFAULT_MODEL must exist in catalog.
 * Side-effects: none (fully mocked)
 * Notes: Uses mocked session and cache - no real HTTP server or database required. Stubs DEFAULT_MODEL env var.
 * Links: /api/v1/ai/models route, ai.models.v1.contract
 * @internal
 */

import { loadModelsCatalogFixture } from "@tests/_fixtures/ai/fixtures";
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
  });

  it("should return 200 with contract-valid response when authenticated", async () => {
    // Arrange
    const catalog = loadModelsCatalogFixture();
    const defaultModelId = "gpt-4o-mini";
    vi.mocked(serverEnv).mockReturnValue({
      DEFAULT_MODEL: defaultModelId,
    } as ReturnType<typeof serverEnv>);

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

    // Assert - defaultModelId comes from env
    expect(parsed.defaultModelId).toBe(defaultModelId);

    // Assert - defaultModelId exists in returned models
    const modelIds = parsed.models.map((m) => m.id);
    expect(modelIds).toContain(defaultModelId);
  });

  it("should return 401 when not authenticated", async () => {
    // Arrange
    vi.mocked(serverEnv).mockReturnValue({
      DEFAULT_MODEL: "gpt-4o-mini",
    } as ReturnType<typeof serverEnv>);
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);

    // Assert
    expect(response.status).toBe(401);
  });

  it("should return 503 when cache fails", async () => {
    // Arrange
    vi.mocked(serverEnv).mockReturnValue({
      DEFAULT_MODEL: "gpt-4o-mini",
    } as ReturnType<typeof serverEnv>);
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

  it("should return 500 when DEFAULT_MODEL not in catalog", async () => {
    // Arrange - catalog with limited models, env points to non-existent model
    const catalog = loadModelsCatalogFixture();
    const invalidDefaultModel = "model-not-in-litellm-catalog";
    vi.mocked(serverEnv).mockReturnValue({
      DEFAULT_MODEL: invalidDefaultModel,
    } as ReturnType<typeof serverEnv>);

    vi.mocked(getSessionUser).mockResolvedValue({
      id: "test-user",
      walletAddress: generateTestWallet("models-route-invalid-default"),
    });
    // Return catalog that doesn't contain the DEFAULT_MODEL
    vi.mocked(getCachedModels).mockResolvedValue(catalog);

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);
    const data = await response.json();

    // Assert - Must return 500 with typed error and structured log
    expect(response.status).toBe(500);
    expect(data).toHaveProperty("error");
    expect(data.error).toBe("Server configuration error");
  });
});
