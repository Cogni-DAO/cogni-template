// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Server-side environment variable validation and type-safe configuration schema using Zod.
 * Scope: Validates process.env for server runtime; provides serverEnv object. Does not handle client-side env vars.
 * Invariants: All required env vars validated at startup; provides boolean flags for NODE_ENV variants; fails fast on invalid env.
 * Side-effects: process.env
 * Notes: Includes LLM config for Stage 8; validates URLs and secrets; provides default values where appropriate.
 * Links: Environment configuration specification
 * @public
 */

import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Required now
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),

  // LLM (Stage 8)
  LITELLM_BASE_URL: z.string().url(),
  LITELLM_MASTER_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  DEFAULT_MODEL: z.string().default("openrouter/auto"),

  // Optional
  PORT: z.coerce.number().default(3000),
  PINO_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
});

const parsed = serverSchema.parse(process.env);

export const serverEnv = {
  ...parsed,
  isDev: parsed.NODE_ENV === "development",
  isTest: parsed.NODE_ENV === "test",
  isProd: parsed.NODE_ENV === "production",
};

export type ServerEnv = typeof serverEnv;
