// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Server-side environment variable validation and type-safe configuration schema using Zod.
 * Scope: Validates process.env for server runtime; provides lazy server environment access. Does not handle client-side env vars.
 * Invariants: All required env vars validated on first access; provides boolean flags for runtime and test modes; fails fast on invalid env.
 * Side-effects: process.env
 * Notes: APP_ENV for adapter wiring; SERVICE_NAME for observability; LLM config; DATABASE_URL required (no component-piece fallback).
 *        Lazy init prevents build-time access. Per DATABASE_RLS_SPEC.md design decision 7: no DSN construction in runtime code.
 * Links: Environment configuration specification
 * @public
 */

import "server-only";

import { existsSync } from "node:fs";
import { join } from "node:path";

import { ZodError, z } from "zod";

import { assertEnvInvariants } from "./invariants";

// Env vars are strings - empty string "" should be treated as "not set" for optional fields.
// Docker-compose passes through empty strings from shell even when .env file omits the var.
// Note: whitespace-only strings are kept as-is (will fail validation, not silently accepted).
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v === "" ? undefined : v;
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional()
);

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
export const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Application environment (controls adapter wiring)
  APP_ENV: z.enum(["test", "production"]),
  APP_BASE_URL: z.string().url().optional(),
  DOMAIN: z.string().optional(),

  // Deployment environment (for observability labels and analytics filtering)
  DEPLOY_ENVIRONMENT: z.string().optional(),

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
  LITELLM_MASTER_KEY: z.string().min(1),

  // TODO: Remove when proper wallet→key registry exists (MVP crutch)
  // Wallet link MVP - single API key for all wallets (temporary)
  LITELLM_MVP_API_KEY: z.string().default("test-mvp-api-key"),

  // Billing (Stage 6.5)
  USER_PRICE_MARKUP_FACTOR: z.coerce.number().min(1.0).default(2.0),

  // Database connections — both required, no component-piece fallback.
  // Per DATABASE_RLS_SPEC.md design decision 7: runtime app consumes explicit DSNs only.
  // app_user role (RLS enforced) — used by Next.js request paths
  DATABASE_URL: z.string().url(),
  // app_service role (BYPASSRLS) — used by auth, workers, bootstrap
  DATABASE_SERVICE_URL: z.string().url(),

  // NextAuth secret (required for JWT signing)
  AUTH_SECRET: z.string().min(32),

  // Optional
  PORT: z.coerce.number().default(3000),
  PINO_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),

  // Metrics (Stage 9) - Prometheus scraping (min 32 chars to reduce weak-token risk)
  // Note: PROMETHEUS_* vars are Alloy-only (infra); app only needs the scrape token.
  METRICS_TOKEN: z.string().min(32).optional(),

  // Scheduler API token - Bearer auth for scheduler-worker → internal graph execution API
  // Per SCHEDULER_SPEC.md: scheduler worker authenticates via shared secret to call
  // POST /api/internal/graphs/{graphId}/runs. Min 32 chars to reduce weak-token risk.
  // Required: Internal execution API will not function without this token.
  SCHEDULER_API_TOKEN: z.string().min(32),

  // Prometheus Query (Grafana Cloud) - READ path for app metrics queries
  // Query URL derived from PROMETHEUS_REMOTE_WRITE_URL (must end with /api/prom/push)
  // Or set PROMETHEUS_QUERY_URL explicitly for non-standard endpoints
  // Security: Use read-only token, separate from Alloy's write token
  PROMETHEUS_REMOTE_WRITE_URL: optionalUrl,
  PROMETHEUS_QUERY_URL: optionalUrl,
  PROMETHEUS_READ_USERNAME: optionalString,
  PROMETHEUS_READ_PASSWORD: optionalString,
  ANALYTICS_K_THRESHOLD: z.coerce.number().int().positive().default(50),
  ANALYTICS_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // EVM RPC - On-chain verification (Phase 3)
  // Required for production/preview/dev; not used in test mode (FakeEvmOnchainClient)
  EVM_RPC_URL: z.string().url().optional(),

  // Langfuse (AI observability) - Optional
  // Only required when Langfuse tracing is enabled
  LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
  LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
  LANGFUSE_BASE_URL: z.string().url().optional(),

  // AI Telemetry - Router policy version for reproducibility
  // Per AI_SETUP_SPEC.md: semver or git SHA identifying model routing policy
  ROUTER_POLICY_VERSION: z.string().default("1.0.0"),

  // LangGraph Dev Server - Optional
  // When set, graph execution uses langgraph dev server instead of in-process
  // Per LANGGRAPH_SERVER.md MVP: default port 2024 for langgraph dev
  LANGGRAPH_DEV_URL: z.string().url().optional(),

  // Tavily Web Search - Optional
  // Required for research graph web search capability
  TAVILY_API_KEY: z.string().min(1).optional(),

  // Temporal (Schedule orchestration) - Required
  // Per SCHEDULER_SPEC.md: Temporal is required infrastructure, no fallback
  // Start Temporal with: pnpm dev:infra
  TEMPORAL_ADDRESS: z.string().min(1), // e.g., "localhost:7233" or "temporal:7233"
  TEMPORAL_NAMESPACE: z.string().min(1), // e.g., "cogni-test" or "cogni-production"
  TEMPORAL_TASK_QUEUE: z.string().default("scheduler-tasks"),

  // Scheduler-worker health check URL
  // Used by /readyz to verify scheduler-worker is ready before stack tests
  // Default: http://scheduler-worker:9000 (Docker network)
  // Override: http://localhost:9001 for test:stack:dev (app on host)
  SCHEDULER_WORKER_HEALTH_URL: z
    .string()
    .url()
    .default("http://scheduler-worker:9000"),

  // Repo access (in-process ripgrep) — required, no default
  // Must be explicitly set in every environment (.env.local, CI, compose)
  // to prevent green-CI / broken-prod blind spots from silent cwd() fallback
  COGNI_REPO_PATH: z.string().min(1),
  // SHA override for mounts without .git (e.g., git-sync worktree)
  COGNI_REPO_SHA: optionalString,
});

type ServerEnv = z.infer<typeof serverSchema> & {
  /** Validated repo root path (resolved from COGNI_REPO_PATH) */
  COGNI_REPO_ROOT: string;
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

      // Cross-field invariants (beyond Zod schema)
      // Per DATABASE_RLS_SPEC.md design decision 7: enforce role separation at boot
      assertEnvInvariants(parsed);

      // Per DATABASE_RLS_SPEC.md §SSL_REQUIRED_NON_LOCAL: reject non-localhost
      // PostgreSQL URLs without sslmode= to prevent credential sniffing.
      if (parsed.DATABASE_URL.startsWith("postgresql://")) {
        try {
          const dbUrl = new URL(parsed.DATABASE_URL);
          const host = dbUrl.hostname;
          const isLocal = host === "localhost" || host === "127.0.0.1";
          if (!isLocal && !dbUrl.searchParams.has("sslmode")) {
            throw new Error(
              `DATABASE_URL points to non-localhost host "${host}" but is missing sslmode= parameter. ` +
                "Add ?sslmode=require (or stricter) for production safety."
            );
          }
        } catch (e) {
          // URL parse failure on non-standard schemes (e.g., sqlite://) is fine
          if (e instanceof Error && e.message.includes("sslmode")) throw e;
        }
      }

      // Per DATABASE_RLS_SPEC.md §SSL_REQUIRED_NON_LOCAL: enforce sslmode on DATABASE_SERVICE_URL too.
      if (parsed.DATABASE_SERVICE_URL?.startsWith("postgresql://")) {
        try {
          const svcUrl = new URL(parsed.DATABASE_SERVICE_URL);
          const host = svcUrl.hostname;
          const isLocal = host === "localhost" || host === "127.0.0.1";
          if (!isLocal && !svcUrl.searchParams.has("sslmode")) {
            throw new Error(
              `DATABASE_SERVICE_URL points to non-localhost host "${host}" but is missing sslmode= parameter. ` +
                "Add ?sslmode=require (or stricter) for production safety."
            );
          }
        } catch (e) {
          if (e instanceof Error && e.message.includes("sslmode")) throw e;
        }
      }

      // Resolve COGNI_REPO_ROOT from required COGNI_REPO_PATH (no cwd fallback)
      const COGNI_REPO_ROOT = parsed.COGNI_REPO_PATH;
      // Boot validation: path must exist and look like a repo root
      if (!existsSync(COGNI_REPO_ROOT)) {
        throw new Error(`COGNI_REPO_ROOT does not exist: ${COGNI_REPO_ROOT}`);
      }
      if (
        !existsSync(join(COGNI_REPO_ROOT, "package.json")) &&
        !existsSync(join(COGNI_REPO_ROOT, ".git"))
      ) {
        throw new Error(
          `COGNI_REPO_ROOT missing package.json and .git: ${COGNI_REPO_ROOT}`
        );
      }

      ENV = {
        ...parsed,
        COGNI_REPO_ROOT,
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
