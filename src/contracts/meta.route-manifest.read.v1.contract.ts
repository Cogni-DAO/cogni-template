// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/meta.route-manifest.read.v1.contract`
 * Purpose: Contract for meta routes endpoint exposing site route manifest.
 * Scope: Defines HTTP contract for route discovery. Does not include auth/private routes.
 * Invariants: Stable API contract; schema validates all responses.
 * Side-effects: none
 * Notes: Used by e2e testing and future MCP tooling; follows hex architecture.
 * Links: \@features/site-meta/routeManifest, /meta/route-manifest endpoint
 * @internal
 */

import { z } from "zod";

export const routeTagSchema = z.enum(["public", "a11y-smoke", "auth", "docs"]);

export const routeEntrySchema = z.object({
  path: z.string(),
  tags: z.array(routeTagSchema),
});

export const metaRoutesOutputSchema = z.object({
  version: z.literal(1),
  routes: z.array(routeEntrySchema),
});

// Protocol-neutral operation metadata.
// This is what both HTTP (ts-rest) and MCP will consume.
export const metaRouteManifestOperation = {
  id: "meta.route-manifest.read.v1",
  summary: "Route manifest for UI + e2e",
  description: "Lists public routes and tags for a11y and agents.",
  input: null,
  output: metaRoutesOutputSchema,
} as const;
