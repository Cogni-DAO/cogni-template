// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/http/router.v1`
 * Purpose: ts-rest HTTP contract router for API v1 endpoints.
 * Scope: Defines HTTP-specific contracts. Does not include protocol-neutral operations.
 * Invariants: All routes map to protocol-neutral operations; HTTP methods and paths stable.
 * Side-effects: none
 * Notes: Used by OpenAPI generation and future ts-rest server adapters.
 * Links: Protocol-neutral operations, OpenAPI generator
 * @internal
 */

import { initContract } from "@ts-rest/core";

import { metaHealthOutputSchema } from "@/contracts/meta.health.read.v1.contract";
import { metaRoutesOutputSchema } from "@/contracts/meta.route-manifest.read.v1.contract";

const c = initContract();

export const ApiContractV1 = c.router({
  metaRouteManifest: {
    method: "GET",
    path: "/meta/route-manifest",
    summary: "Route manifest for UI + e2e",
    description: "Lists public routes and tags for a11y and agents.",
    responses: {
      200: metaRoutesOutputSchema,
    },
  },
  metaHealth: {
    method: "GET",
    path: "/health",
    summary: "Health check for liveness and readiness",
    description:
      "Returns service health status for monitoring and deployment checks.",
    responses: {
      200: metaHealthOutputSchema,
      503: metaHealthOutputSchema,
    },
  },
  // Future endpoints: metaOpenapi, etc.
});
