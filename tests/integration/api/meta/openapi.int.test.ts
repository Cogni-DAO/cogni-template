// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/api/v1/meta/openapi`
 * Purpose: Verifies OpenAPI specification endpoint returns valid OpenAPI 3.x document with expected structure.
 * Scope: HTTP integration tests hitting live Next.js server. Does NOT test OpenAPI generation logic or contract mapping.
 * Invariants: Response is valid OpenAPI 3.x format; contains required info fields; includes meta endpoint paths.
 * Side-effects: IO (HTTP to server)
 * Notes: Requires TEST_BASE_URL environment variable; server must be running on specified port.
 * Links: src/contracts/http/openapi.v1.ts
 * @internal
 */

import { describe, expect, it } from "vitest";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

describe("GET /api/v1/meta/openapi", () => {
  it("returns OpenAPI specification", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/openapi`);
    expect(res.status).toBe(200);

    const json = await res.json();

    // Basic OpenAPI 3.0 structure validation
    expect(json).toHaveProperty("openapi");
    expect(json.openapi).toMatch(/^3\./);
    expect(json).toHaveProperty("info");
    expect(json).toHaveProperty("paths");
  });

  it("returns correct content type", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/openapi`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("contains required OpenAPI info fields", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/openapi`);
    const json = await res.json();

    expect(json.info).toHaveProperty("title");
    expect(json.info).toHaveProperty("version");
    expect(typeof json.info.title).toBe("string");
    expect(typeof json.info.version).toBe("string");
  });

  it("includes paths for meta endpoints", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/openapi`);
    const json = await res.json();

    expect(json.paths).toHaveProperty("/api/v1/meta/health");
    expect(json.paths).toHaveProperty("/api/v1/meta/route-manifest");
  });
});
