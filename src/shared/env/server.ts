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

import { z, ZodError } from "zod";

export interface EnvValidationMeta {
  code: "INVALID_ENV";
  missing: string[];
  invalid: string[];
}

export class EnvValidationError extends Error {
  readonly meta: EnvValidationMeta;

  constructor(meta: EnvValidationMeta) {
    super(`Invalid server env: ${JSON.stringify(meta)}`);
    this.name = "EnvValidationError";
    this.meta = meta;
  }
}

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Required now
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
    try {
      const parsed = serverSchema.parse(process.env);
      _serverEnv = {
        ...parsed,
        isDev: parsed.NODE_ENV === "development",
        isTest: parsed.NODE_ENV === "test",
        isProd: parsed.NODE_ENV === "production",
      };
    } catch (error) {
      if (error instanceof ZodError) {
        const missing = new Set<string>();
        const invalid = new Set<string>();

        for (const issue of error.issues) {
          const key = issue.path[0]?.toString();
          if (!key) continue;

          /*
           * Treat all invalid_type as missing (avoids any casting)
           */
          if (issue.code === "invalid_type") {
            missing.add(key);
          } else {
            invalid.add(key);
          }
        }

        const meta: EnvValidationMeta = {
          code: "INVALID_ENV",
          missing: [...missing],
          invalid: [...invalid],
        };

        throw new EnvValidationError(meta);
      }

      throw error;
    }
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

export function ensureServerEnv(): ServerEnv {
  return getServerEnv();
}
