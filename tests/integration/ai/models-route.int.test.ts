// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/ai/models-route.int`
 * Purpose: Validates /api/v1/ai/models HTTP endpoint behavior including auth and error handling.
 * Scope: Tests HTTP status codes and response schema compliance. Does not test cache implementation or upstream fetch logic.
 * Invariants: Route requires authentication; returns contract-valid response; handles errors gracefully.
 * Side-effects: none (fully mocked)
 * Notes: Uses mocked session and cache - no real HTTP server or database required.
 * Links: /api/v1/ai/models route, ai.models.v1.contract
 * @internal
 */

import { loadModelsFixture } from "@tests/_fixtures/ai/fixtures";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aiModelsOperation } from "@/contracts/ai.models.v1.contract";

// Mock dependencies
vi.mock("@/app/_lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

vi.mock("@/app/_lib/models-cache", () => ({
  getCachedModels: vi.fn(),
}));

// Import after mocks
import { getSessionUser } from "@/app/_lib/auth/session";
import { getCachedModels } from "@/app/_lib/models-cache";
import { GET } from "@/app/api/v1/ai/models/route";

describe("/api/v1/ai/models integration tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 200 with contract-valid response when authenticated", async () => {
    // Arrange
    const fixture = loadModelsFixture();
    vi.mocked(getSessionUser).mockResolvedValue({
      id: "test-user",
      walletAddress: "0xtest",
    });
    vi.mocked(getCachedModels).mockResolvedValue(fixture);

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);
    const data = await response.json();

    // Assert - HTTP status
    expect(response.status).toBe(200);

    // Assert - Contract compliance
    const parsed = aiModelsOperation.output.parse(data);
    expect(parsed).toEqual(fixture);
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
      walletAddress: "0xtest",
    });
    vi.mocked(getCachedModels).mockRejectedValue(new Error("Cache error"));

    const req = new NextRequest("http://localhost:3000/api/v1/ai/models");

    // Act
    const response = await GET(req);

    // Assert
    expect(response.status).toBe(503);
  });
});
