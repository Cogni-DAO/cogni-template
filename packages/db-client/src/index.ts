// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-client`
 * Purpose: Database client factory and scheduling adapters.
 * Scope: Drizzle client factory + adapter implementations. Does not contain business logic.
 * Invariants:
 * - FORBIDDEN: @/shared/env, process.env, Next.js imports
 * - Re-exports ONLY scheduling schema (not auth/billing slices)
 * Side-effects: IO (database operations)
 * Links: docs/SCHEDULER_SERVICE_REFACTOR.md
 * @public
 */

// Re-export scheduling schema (worker gets schema transitively through db-client)
export * from "@cogni/db-schema/scheduling";

// Adapters
export { DrizzleExecutionGrantAdapter } from "./adapters/drizzle-grant.adapter";
export { DrizzleJobQueueAdapter } from "./adapters/drizzle-job-queue.adapter";
export { DrizzleScheduleRunAdapter } from "./adapters/drizzle-run.adapter";
export { DrizzleScheduleManagerAdapter } from "./adapters/drizzle-schedule.adapter";
// Client factory
export { createDbClient, type Database, type LoggerLike } from "./client";
