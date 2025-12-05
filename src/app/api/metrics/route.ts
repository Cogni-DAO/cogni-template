// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/metrics`
 * Purpose: Prometheus metrics endpoint for Alloy/Prometheus scraping.
 * Scope: Exposes metrics registry. Protected by bearer token authentication. Does not define or record metrics—only exposes them.
 * Invariants: Requires METRICS_TOKEN in production; uses constant-time comparison.
 * Side-effects: IO (reads metrics registry)
 * Notes: Bearer token auth case-insensitive; dev mode allows unauthenticated access if no token configured.
 * Links: Consumed by Alloy scraper, Prometheus, or Grafana Cloud.
 * @public
 */

import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/shared/env";
import { metricsRegistry } from "@/shared/observability";

// Force Node.js runtime (prom-client not Edge-compatible)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Constant-time string comparison to prevent timing attacks.
 * Pads both inputs to max length to eliminate length timing leak.
 */
function safeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  Buffer.from(a, "utf8").copy(bufA);
  Buffer.from(b, "utf8").copy(bufB);
  return timingSafeEqual(bufA, bufB) && a.length === b.length;
}

/**
 * Extract bearer token from Authorization header.
 * Handles case-insensitive "Bearer " prefix, trims whitespace.
 */
function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  // Case-insensitive prefix match
  const trimmed = authHeader.trim();
  const lowerPrefix = trimmed.toLowerCase();

  if (!lowerPrefix.startsWith("bearer ")) return null;

  // Extract and trim the token (after "bearer ")
  return trimmed.slice(7).trim();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = serverEnv();
  const configuredToken = env.METRICS_TOKEN;

  // Production MUST have METRICS_TOKEN configured
  if (env.isProd && !configuredToken) {
    return NextResponse.json(
      { error: "METRICS_TOKEN not configured" },
      { status: 500 }
    );
  }

  // If token is configured, require valid auth
  if (configuredToken) {
    const authHeader = request.headers.get("authorization");
    const providedToken = extractBearerToken(authHeader);

    if (!providedToken || !safeCompare(providedToken, configuredToken)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  // Dev mode without token: allow unauthenticated access for local testing

  const metrics = await metricsRegistry.metrics();
  return new NextResponse(metrics, {
    headers: {
      "Content-Type": metricsRegistry.contentType,
      "Cache-Control": "no-store",
    },
  });
}
