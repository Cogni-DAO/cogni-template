// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Server-side environment variable validation and type-safe configuration schema using Zod.
 * Scope: Validates process.env for server runtime; provides serverEnv object. Does not handle client-side env vars.
 * Invariants: All required env vars validated on first access; provides boolean flags for NODE_ENV variants; fails fast on invalid env.
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
  // TODO: Enable when session management is implemented
  // SESSION_SECRET: z.string().min(32),

  // LLM (Stage 8) - App only needs proxy access, not provider keys
  LITELLM_BASE_URL: z
    .string()
    .url()
    .default(
      process.env.NODE_ENV === "production"
        ? "http://litellm:4000"
        : "http://localhost:4000"
    ),
  LITELLM_MASTER_KEY: z.string().min(1),
  DEFAULT_MODEL: z.string().default("openrouter/auto"),

  // Optional
  PORT: z.coerce.number().default(3000),
  PINO_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
});

type ParsedEnv = z.infer<typeof serverSchema> & {
  isDev: boolean;
  isTest: boolean;
  isProd: boolean;
};

let _serverEnv: ParsedEnv | null = null;

function getServerEnv(): ParsedEnv {
  if (_serverEnv === null) {
    const parsed = serverSchema.parse(process.env);
    _serverEnv = {
      ...parsed,
      isDev: parsed.NODE_ENV === "development",
      isTest: parsed.NODE_ENV === "test",
      isProd: parsed.NODE_ENV === "production",
    };
  }
  return _serverEnv;
}

export const serverEnv = new Proxy({} as ParsedEnv, {
  get(_, prop) {
    return getServerEnv()[prop as keyof ParsedEnv];
  },
  ownKeys() {
    return Reflect.ownKeys(getServerEnv());
  },
  getOwnPropertyDescriptor(_, prop) {
    return Reflect.getOwnPropertyDescriptor(getServerEnv(), prop);
  },
  has(_, prop) {
    return prop in getServerEnv();
  },
}) as ParsedEnv;

export type ServerEnv = ParsedEnv;
