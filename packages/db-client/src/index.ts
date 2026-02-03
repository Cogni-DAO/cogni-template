// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-client`
 * Purpose: Database client factory and scheduling adapters.
 * Scope: Drizzle client factory + adapter implementations. Does not contain business logic.
 * Invariants:
 * - FORBIDDEN: @/shared/env, process.env, Next.js imports
 * - Re-exports full schema (all domain slices)
 * Side-effects: IO (database operations)
 * Links: docs/PACKAGES_ARCHITECTURE.md
 * @public
 */

// Re-export full schema (consumers get all tables transitively through db-client)
export * from "@cogni/db-schema";
export { DrizzleExecutionRequestAdapter } from "./adapters/drizzle-execution-request.adapter";
// Adapters
export { DrizzleExecutionGrantAdapter } from "./adapters/drizzle-grant.adapter";
export { DrizzleScheduleRunAdapter } from "./adapters/drizzle-run.adapter";
export { DrizzleScheduleManagerAdapter } from "./adapters/drizzle-schedule.adapter";
// Client factories
export {
  createAppDbClient,
  createDbClient,
  createServiceDbClient,
  type Database,
  type LoggerLike,
} from "./client";
// Tenant-scope helpers (generic over any Drizzle schema)
export { setTenantContext, withTenantScope } from "./tenant-scope";
