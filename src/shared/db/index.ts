// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db`
 * Purpose: Barrel export for database schema and URL construction utilities.
 * Scope: Exposes database schema and URL construction utilities. Does not handle connections or migrations.
 * Invariants: Only re-exports public APIs; maintains type safety.
 * Side-effects: none
 * Notes: Used by adapters for database operations
 * Links: Used by adapters for database operations
 * @public
 */

export * from "./db-url";
export * from "./schema";
