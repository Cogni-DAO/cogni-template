// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Server-side environment variable validation and type-safe configuration schema using Zod.
 * Scope: Validates process.env for server runtime; provides serverEnv object with APP_ENV support. Does not handle client-side env vars.
 * Invariants: All required env vars validated on first access; provides boolean flags for runtime and test modes; fails fast on invalid env.
 * Side-effects: process.env
 * Notes: Includes APP_ENV for adapter wiring; LLM config; validates URLs and secrets; production guard prevents test mode in prod.
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

  // Application environment (controls adapter wiring)
  APP_ENV: z
    .enum(["test"])
    .optional()
    .refine(
      (appEnv) => {
        const nodeEnv = process.env.NODE_ENV;
        // Hard guard: APP_ENV=test must be rejected in production deployments
        if (appEnv === "test" && nodeEnv === "production") {
          return false;
        }
        return true;
      },
      {
        message: "APP_ENV=test is forbidden in production deployments",
      }
    ),

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
  isTestMode: boolean;
};

let _serverEnv: ParsedEnv | null = null;

function getServerEnv(): ParsedEnv {
  if (_serverEnv === null) {
    try {
      const parsed = serverSchema.parse(process.env);
      const isDev = parsed.NODE_ENV === "development";
      const isTest = parsed.NODE_ENV === "test";
      const isProd = parsed.NODE_ENV === "production";
      const isTestMode = parsed.APP_ENV === "test";

      _serverEnv = {
        ...parsed,
        isDev,
        isTest,
        isProd,
        isTestMode,
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
