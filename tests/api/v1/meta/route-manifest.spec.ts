// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/api/v1/meta/route-manifest`
 * Purpose: Verifies route manifest API endpoint behavior against contract schema and validates specific route entries.
 * Scope: HTTP integration tests hitting live Next.js server. Does NOT test route discovery or internal routing logic.
 * Invariants: Response matches metaRoutesOutputSchema; home and docs routes present; version is 1.
 * Side-effects: IO (HTTP to server)
 * Notes: Requires TEST_BASE_URL environment variable; server must be running on specified port.
 * Links: src/contracts/meta.route-manifest.read.v1.contract.ts, src/features/site-meta/routeManifest.ts
 * @internal
 */

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import type { routeEntrySchema } from "@/contracts/meta.route-manifest.read.v1.contract";
import { metaRoutesOutputSchema } from "@/contracts/meta.route-manifest.read.v1.contract";

type RouteEntry = z.infer<typeof routeEntrySchema>;

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";

describe("GET /api/v1/meta/route-manifest", () => {
  it("returns a valid route manifest", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/route-manifest`);
    expect(res.status).toBe(200);

    const json = await res.json();
    const parsed = metaRoutesOutputSchema.safeParse(json);
    if (!parsed.success) {
      console.error(parsed.error.issues);
      throw new Error("Response did not match contract");
    }

    expect(parsed.data.routes.length).toBeGreaterThan(0);
  });

  it("returns correct content type", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/route-manifest`);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("contains version 1 in response", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/route-manifest`);
    const json = await res.json();

    expect(json.version).toBe(1);
  });

  it("includes home page route", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/route-manifest`);
    const json = await res.json();

    const homeRoute = json.routes.find(
      (route: RouteEntry) => route.path === "/"
    );
    expect(homeRoute).toBeDefined();
    expect(homeRoute.tags).toContain("public");
  });

  it("includes docs page route", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/route-manifest`);
    const json = await res.json();

    const docsRoute = json.routes.find(
      (route: RouteEntry) => route.path === "/docs"
    );
    expect(docsRoute).toBeDefined();
    expect(docsRoute.tags).toContain("public");
    expect(docsRoute.tags).toContain("docs");
  });

  it("includes expected routes from routeManifest", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/meta/route-manifest`);
    const json = await res.json();

    // Verify all expected routes are present
    const paths = json.routes.map((route: RouteEntry) => route.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/docs");
    expect(paths).toContain("/pricing");

    // Verify minimum expected routes count
    expect(json.routes.length).toBeGreaterThanOrEqual(3);
  });
});
