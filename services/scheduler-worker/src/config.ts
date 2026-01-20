// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/config`
 * Purpose: Environment configuration with Zod validation.
 * Scope: Reads and validates env vars on startup. Does not contain runtime logic.
 * Invariants:
 * - DATABASE_URL required
 * - Fails fast with clear errors on invalid config
 * Side-effects: Reads process.env
 * Links: services/scheduler-worker/Dockerfile
 * @internal
 */

import { z } from "zod";

const EnvSchema = z.object({
  /** PostgreSQL connection string (required) */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Log level (default: info) */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Worker concurrency (default: 5) */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  /** Poll interval in ms (default: 1000) */
  WORKER_POLL_INTERVAL: z.coerce.number().int().min(100).default(1000),
  /** Service name for logging (default: scheduler-worker) */
  SERVICE_NAME: z.string().default("scheduler-worker"),
  /** Health endpoint port (default: 9000) */
  HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
});

export type Config = z.infer<typeof EnvSchema>;

/**
 * Loads and validates configuration from environment.
 * Throws on invalid config with clear error messages.
 */
export function loadConfig(): Config {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }
  return result.data;
}
