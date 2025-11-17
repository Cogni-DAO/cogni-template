// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/db`
 * Purpose: Database adapter entry point for server-side database access.
 * Scope: Re-exports database client and types. Does not contain implementation logic.
 * Invariants: Clean entry point for database access
 * Side-effects: none (re-exports only)
 * Notes: Provides access to Drizzle database instance
 * Links: Used by other adapters and services
 * @public
 */

export { type Database, db } from "./drizzle.client";
