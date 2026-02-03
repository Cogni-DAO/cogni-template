// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/db-schema`
 * Purpose: Root barrel re-exporting all schema slices for consumers that need the full schema.
 * Scope: Re-exports only. Does not define any tables.
 * Invariants: Must re-export every slice so the resulting namespace matches src/shared/db/schema.ts.
 * Side-effects: none
 * Links: docs/PACKAGES_ARCHITECTURE.md, docs/DATABASE_RLS_SPEC.md
 * @public
 */

export * from "./ai";
export * from "./auth";
export * from "./billing";
export * from "./refs";
export * from "./scheduling";
