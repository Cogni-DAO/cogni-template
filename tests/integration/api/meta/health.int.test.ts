// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/api/v1/meta/health`
 * Purpose: Verifies health check API endpoint behavior against contract schema and validates response format.
 * Scope: HTTP integration tests hitting live Next.js server. Does NOT test internal health monitoring logic.
 * Invariants: Response matches metaHealthOutputSchema; status is valid enum value; timestamp is valid ISO string.
 * Side-effects: IO (HTTP to server)
 * Notes: Requires TEST_BASE_URL environment variable; server must be running on specified port.
 * Links: src/contracts/meta.health.read.v1.contract.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

import { metaHealthOutputSchema } from "@/contracts/meta.health.read.v1.contract";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

describe("GET /api/v1/meta/health", () => {
  it("returns a valid health response", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/health`);
    expect(res.status).toBe(200);

    const json = await res.json();
    const parsed = metaHealthOutputSchema.safeParse(json);
    if (!parsed.success) {
      console.error(parsed.error.issues);
      throw new Error("Response did not match contract");
    }

    expect(parsed.data.status).toMatch(/^(healthy|degraded|unhealthy)$/);
    expect(parsed.data.timestamp).toBeTruthy();
  });

  it("returns correct content type", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/health`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("timestamp is a valid ISO date string", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/health`);
    const json = await res.json();

    expect(() => new Date(json.timestamp).toISOString()).not.toThrow();
  });
});
