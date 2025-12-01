// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Server-side environment variable validation and type-safe configuration schema using Zod.
 * Scope: Validates process.env for server runtime; provides lazy server environment access. Does not handle client-side env vars.
 * Invariants: All required env vars validated on first access; provides boolean flags for runtime and test modes; fails fast on invalid env.
 * Side-effects: process.env
 * Notes: APP_ENV for adapter wiring; SERVICE_NAME for observability; LLM config; DATABASE_URL from direct var or component vars.
 *        Lazy init prevents build-time access.
 * Links: Environment configuration specification
 * @public
 */

import { ZodError, z } from "zod";

import { buildDatabaseUrl } from "@/shared/db";

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

// Server schema with all environment variables
const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Application environment (controls adapter wiring)
  APP_ENV: z.enum(["test", "production"]),
  APP_BASE_URL: z.string().url().optional(),
  DOMAIN: z.string().optional(),

  // Service identity for observability (multi-service deployments)
  SERVICE_NAME: z.string().default("app"),

  // LLM (Stage 8) - App only needs proxy access, not provider keys
  LITELLM_BASE_URL: z
    .string()
    .url()
    .default(
      process.env.NODE_ENV === "production"
        ? "http://litellm:4000"
        : "http://localhost:4000"
    ),
  LITELLM_MASTER_KEY: z.string().min(1).optional(),
  DEFAULT_MODEL: z.string().default("gpt-4o-mini"),

  // TODO: Remove when proper wallet→key registry exists (MVP crutch)
  // Wallet link MVP - single API key for all wallets (temporary)
  LITELLM_MVP_API_KEY: z.string().default("test-mvp-api-key"),

  // Billing (Stage 6.5)
  USER_PRICE_MARKUP_FACTOR: z.coerce.number().min(1.0).default(2.0),
  CREDITS_PER_USDC: z.coerce.number().int().positive().default(1000),

  // Database connection: either provide DATABASE_URL directly OR component pieces
  DATABASE_URL: z.string().url().optional(),
  POSTGRES_USER: z.string().min(1).optional(),
  POSTGRES_PASSWORD: z.string().min(1).optional(),
  POSTGRES_DB: z.string().min(1).optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().default(5432),

  // NextAuth secret (required for JWT signing)
  AUTH_SECRET: z.string().min(32),

  // Optional
  PORT: z.coerce.number().default(3000),
  PINO_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
});

type ServerEnv = z.infer<typeof serverSchema> & {
  DATABASE_URL: string;
  isDev: boolean;
  isTest: boolean;
  isProd: boolean;
  isTestMode: boolean;
};

let ENV: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (ENV === null) {
    try {
      const parsed = serverSchema.parse(process.env);
      const isDev = parsed.NODE_ENV === "development";
      const isTest = parsed.NODE_ENV === "test";
      const isProd = parsed.NODE_ENV === "production";
      const isTestMode = parsed.APP_ENV === "test";

      // Handle DATABASE_URL: use provided URL or construct from component pieces
      let DATABASE_URL: string;
      if (parsed.DATABASE_URL) {
        // Direct DATABASE_URL provided (e.g., CI with sqlite://build.db)
        DATABASE_URL = parsed.DATABASE_URL;
      } else {
        // Construct from component pieces (e.g., local development)
        if (
          !parsed.POSTGRES_USER ||
          !parsed.POSTGRES_PASSWORD ||
          !parsed.POSTGRES_DB ||
          !parsed.DB_HOST
        ) {
          throw new Error(
            "Either DATABASE_URL or all component variables (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB, DB_HOST) must be provided"
          );
        }
        DATABASE_URL = buildDatabaseUrl({
          POSTGRES_USER: parsed.POSTGRES_USER,
          POSTGRES_PASSWORD: parsed.POSTGRES_PASSWORD,
          POSTGRES_DB: parsed.POSTGRES_DB,
          DB_HOST: parsed.DB_HOST,
          DB_PORT: parsed.DB_PORT,
        });
      }

      ENV = {
        ...parsed,
        DATABASE_URL,
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
  return ENV;
}

export type { ServerEnv };
