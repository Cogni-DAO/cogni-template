// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/completion`
 * Purpose: Verifies end-to-end HTTP API behavior for AI completion with fake adapter in CI.
 * Scope: Full request/response cycle testing against deterministic fake responses. Does NOT test internal business logic.
 * Invariants: HTTP status codes; response schema compliance; fake adapter assertions; error handling.
 * Side-effects: IO
 * Notes: Uses APP_ENV=test in CI to test with FakeLlmAdapter; asserts deterministic "[FAKE_COMPLETION]" responses.
 * Links: completion route, aiCompletionOperation contract
 * @public
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Note: This test file is designed for the test:int suite
// It assumes a running Next.js server and makes real HTTP requests
// For now, we'll mock the dependencies to avoid requiring real LiteLLM

describe("API /v1/ai/completion", () => {
  // These tests run against fake adapter in CI (APP_ENV=test)

  const API_BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const COMPLETION_ENDPOINT = `${API_BASE}/api/v1/ai/completion`;

  beforeAll(async () => {
    // Server expected to be running via docker-compose in CI
  });

  afterAll(async () => {
    // Cleanup handled by CI workflow
  });

  it("should handle valid completion request with Fake Adapter", async () => {
    // Arrange
    const requestBody = {
      messages: [{ role: "user", content: "Hello, AI!" }],
    };

    // Act
    const response = await fetch(COMPLETION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
      body: JSON.stringify(requestBody),
    });

    // Assert
    expect(response.status).toBe(200);

    const responseData = await response.json();
    expect(responseData).toHaveProperty("message");
    expect(responseData.message).toHaveProperty("role", "assistant");
    expect(responseData.message).toHaveProperty("content", "[FAKE_COMPLETION]");
    expect(responseData.message).toHaveProperty("timestamp");
  });

  it("should return 401 when Authorization header is missing", async () => {
    // Arrange
    const requestBody = {
      messages: [{ role: "user", content: "Hello" }],
    };

    // Act
    const response = await fetch(COMPLETION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    // Assert
    expect(response.status).toBe(401);
    const responseData = await response.json();
    expect(responseData).toHaveProperty("error", "API key required");
  });

  it("should return 401 when Authorization header is malformed", async () => {
    // Arrange
    const requestBody = {
      messages: [{ role: "user", content: "Hello" }],
    };

    // Act
    const response = await fetch(COMPLETION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic invalid-format",
      },
      body: JSON.stringify(requestBody),
    });

    // Assert
    expect(response.status).toBe(401);
    const responseData = await response.json();
    expect(responseData).toHaveProperty("error", "API key required");
  });

  it("should return 401 when Bearer token is empty", async () => {
    // Arrange
    const requestBody = {
      messages: [{ role: "user", content: "Hello" }],
    };

    // Act
    const response = await fetch(COMPLETION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer ",
      },
      body: JSON.stringify(requestBody),
    });

    // Assert
    expect(response.status).toBe(401);
    const responseData = await response.json();
    expect(responseData).toHaveProperty("error", "API key required");
  });

  it("should return 400 for invalid input", async () => {
    // Arrange
    const requestBody = {
      messages: [{ role: "invalid_role", content: "Hello" }],
    };

    // Act
    const response = await fetch(COMPLETION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
      body: JSON.stringify(requestBody),
    });

    // Assert
    expect(response.status).toBe(400);

    const responseData = await response.json();
    expect(responseData).toHaveProperty("error");
  });

  it("should handle server errors gracefully", async () => {
    // This test would verify behavior when LiteLLM is down
    // TODO: Implement when real service integration is available

    // For now, just verify endpoint exists
    const response = await fetch(COMPLETION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Test" }],
      }),
    });

    // Should not return 404 (endpoint exists)
    expect(response.status).not.toBe(404);
  });
});

// Alternative: Minimal smoke test that can run without full server
describe("API endpoint smoke test", () => {
  it("should export route handlers", async () => {
    // Verify the route module exports the expected handlers
    const routeModule = await import("@/app/api/v1/ai/completion/route");

    expect(routeModule).toHaveProperty("POST");
    expect(typeof routeModule.POST).toBe("function");
    expect(routeModule).toHaveProperty("dynamic", "force-dynamic");
  });
});
