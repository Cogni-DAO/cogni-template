// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/db/schema`
 * Purpose: Drizzle database schema definitions for billing and shared tables.
 * Scope: Billing tables plus re-exports of NextAuth schema (see schema.auth.ts). Does not handle connections or migrations.
 * Invariants: All tables have proper types and constraints.
 * Side-effects: none (schema definitions only)
 * Links: None
 * @public
 */

export * from "./schema.ai";
export * from "./schema.auth";
export * from "./schema.billing";
