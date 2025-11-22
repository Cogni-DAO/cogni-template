// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/meta.health.read.v1.contract`
 * Purpose: Contract for health check endpoint providing liveness and readiness status.
 * Scope: Defines health check response format. Does not include detailed system diagnostics.
 * Invariants: Stable API contract; status enum remains consistent.
 * Side-effects: none
 * Notes: Used by monitoring systems and deployment health checks.
 * Links: /health endpoint
 * @internal
 */

import { z } from "zod";

export const healthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);

export const metaHealthOutputSchema = z.object({
  status: healthStatusSchema,
  timestamp: z.string(),
  version: z.string().optional(),
});

// Protocol-neutral operation metadata.
// This is what both HTTP (ts-rest) and MCP will consume.
export const metaHealthOperation = {
  id: "meta.health.read.v1",
  summary: "Health check for liveness and readiness",
  description:
    "Returns service health status for monitoring and deployment checks.",
  input: null,
  output: metaHealthOutputSchema,
} as const;
