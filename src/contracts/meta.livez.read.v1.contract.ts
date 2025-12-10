// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/meta.livez.read.v1.contract`
 * Purpose: Contract for liveness probe endpoint (fast, no dependencies).
 * Scope: Minimal liveness check - process is alive and can handle requests. Does not validate env, DB, or external services.
 * Invariants: Always fast (<100ms); no database, no external service checks, no env validation.
 *             HTTP status is primary truth: 200 = alive, 5xx = not alive.
 * Side-effects: none
 * Notes: Used for pre-push artifact validation and K8s liveness probes.
 *        K8s health consumers rely on HTTP status codes, not response body.
 * Links: /livez endpoint
 * @internal
 */

import { z } from "zod";

export const livezStatusSchema = z.enum(["alive"]);

export const metaLivezOutputSchema = z.object({
  status: livezStatusSchema,
  timestamp: z.string(), // RFC3339/ISO-8601 format
});

// Protocol-neutral operation metadata.
export const metaLivezOperation = {
  id: "meta.livez.read.v1",
  summary: "Liveness probe - process alive",
  description:
    "Fast liveness check confirming the process is alive and can handle requests. No dependency checks. HTTP status: 200 = alive, 5xx = not alive.",
  input: null,
  output: metaLivezOutputSchema,
} as const;
