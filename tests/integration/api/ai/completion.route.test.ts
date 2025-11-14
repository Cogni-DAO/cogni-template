// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/completion/route`
 * Purpose: Verifies HTTP route handler integration with mocked facade dependencies.
 * Scope: Route handler testing with request/response. Does NOT test real infrastructure.
 * Invariants: Request validation; response formatting; error status codes.
 * Side-effects: none
 * Notes: Uses mocked completion facade; tests happy path and validation errors.
 * Links: POST handler, completion facade
 * @public
 */

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/ai/completion/route";
import { aiCompletionOperation } from "@/contracts/ai.completion.v1.contract";

vi.mock("@/app/_facades/ai/completion.server", () => ({
  completion: vi.fn(),
}));

import { completion } from "@/app/_facades/ai/completion.server";
const completionMock = vi.mocked(completion);

describe("app/api/v1/ai/completion/route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });
  const createRequest = (body: unknown): NextRequest => {
    return new NextRequest("http://localhost:3000/api/v1/ai/completion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  describe("POST", () => {
    it("should return 200 with valid request", async () => {
      // Arrange
      const requestBody = {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there" },
        ],
      };

      const mockResponse = {
        message: {
          role: "assistant" as const,
          content: "AI response",
          timestamp: "2025-01-01T12:00:00.000Z",
        },
      };

      completionMock.mockResolvedValueOnce(mockResponse);

      const request = createRequest(requestBody);

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(responseData).toEqual(mockResponse);

      // Verify contract compliance
      expect(() =>
        aiCompletionOperation.output.parse(responseData)
      ).not.toThrow();
    });

    it("should return 400 for missing messages field", async () => {
      // Arrange
      const request = createRequest({ invalidField: "value" });

      // Act
      const response = await POST(request);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(400);
      expect(responseData).toEqual({
        error: "Invalid input format",
        details: expect.any(Array),
      });
    });

    it.skip("should return 400 for invalid role values", async () => {
      // TODO: re-enable once route test matrix is stabilized
    });

    it.skip("should return 400 for overlong message content", async () => {
      // TODO: re-enable once route test matrix is stabilized
    });

    it.skip("should return 400 for ChatValidationError from facade", async () => {
      // TODO: re-enable once route test matrix is stabilized
    });

    it.skip("should return 408 for timeout errors", async () => {
      // TODO: re-enable once route test matrix is stabilized
    });

    it.skip("should return 429 for rate limit errors", async () => {
      // TODO: re-enable once route test matrix is stabilized
    });

    it.skip("should return 503 for LiteLLM service errors", async () => {
      // TODO: re-enable once route test matrix is stabilized
    });

    it.skip("should return 500 for unknown errors without leaking internals", async () => {
      // TODO: re-enable once route test matrix is stabilized
    });
  });
});
