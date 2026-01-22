// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/config`
 * Purpose: Environment configuration with Zod validation.
 * Scope: Reads and validates env vars on startup. Does not contain runtime logic.
 * Invariants:
 * - DATABASE_URL required for DB activities
 * - TEMPORAL_* vars required for Temporal connection
 * - SCHEDULER_API_TOKEN required for internal API calls (treat as secret)
 * - Fails fast with clear errors on invalid config
 * Side-effects: Reads process.env
 * Links: services/scheduler-worker/Dockerfile, docs/SCHEDULER_SPEC.md
 * @internal
 */

import { z } from "zod";

const EnvSchema = z.object({
  /** PostgreSQL connection string (required for DB activities) */
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  /** Temporal server address (required) */
  TEMPORAL_ADDRESS: z.string().min(1, "TEMPORAL_ADDRESS is required"),

  /** Temporal namespace (required) - format: cogni-{APP_ENV} */
  TEMPORAL_NAMESPACE: z.string().min(1, "TEMPORAL_NAMESPACE is required"),

  /** Temporal task queue (required) */
  TEMPORAL_TASK_QUEUE: z.string().min(1, "TEMPORAL_TASK_QUEUE is required"),

  /** Scheduler API token for internal API calls (required, treat as secret - never log) */
  SCHEDULER_API_TOKEN: z
    .string()
    .min(32, "SCHEDULER_API_TOKEN must be at least 32 characters"),

  /** Base URL for internal API calls (required) */
  APP_BASE_URL: z.string().url("APP_BASE_URL must be a valid URL"),

  /** Log level (default: info) */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

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
