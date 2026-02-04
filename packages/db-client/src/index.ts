// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-client`
 * Purpose: Safe-surface DB client: app-role factory, adapters, tenant-scope, schema.
 * Scope: App-role factory, adapters, tenant-scope, schema. Does not export createServiceDbClient (BYPASSRLS) — that lives in @cogni/db-client/service.
 * Invariants:
 * - FORBIDDEN: @/shared/env, process.env, Next.js imports
 * - createServiceDbClient is NOT re-exported here (use @cogni/db-client/service)
 * - Re-exports full schema (all domain slices)
 * Side-effects: IO (database operations)
 * Links: docs/PACKAGES_ARCHITECTURE.md, docs/DATABASE_RLS_SPEC.md
 * @public
 */

// Re-export full schema (consumers get all tables transitively through db-client)
export * from "@cogni/db-schema";
// Branded actor types for RLS identity
export {
  type ActorId,
  SYSTEM_ACTOR,
  toUserId,
  type UserId,
  userActor,
} from "./actor";
export { DrizzleExecutionRequestAdapter } from "./adapters/drizzle-execution-request.adapter";
// Adapters
export { DrizzleExecutionGrantAdapter } from "./adapters/drizzle-grant.adapter";
export { DrizzleScheduleRunAdapter } from "./adapters/drizzle-run.adapter";
export { DrizzleScheduleManagerAdapter } from "./adapters/drizzle-schedule.adapter";
// Client factories (safe surface only — no createServiceDbClient)
export {
  createAppDbClient,
  createDbClient,
  type Database,
  type LoggerLike,
} from "./client";
// Tenant-scope helpers (generic over any Drizzle schema)
export { setTenantContext, withTenantScope } from "./tenant-scope";
