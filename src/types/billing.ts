// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@types/billing`
 * Purpose: Shared billing type definitions and categorization constants (logic-free).
 * Scope: Defines charge_reason enum for activity tracking. Re-exports SourceSystem from @cogni/ai-core. Does NOT implement business logic.
 * Invariants:
 * - ONLY exports: enums (as const arrays), literal union types, and simple string mappings
 * - FORBIDDEN: functions, computations, validation logic, or business rules
 * - charge_reason is for accounting/refunds, source_service is for UI/reports
 * - SOURCE_SYSTEMS/SourceSystem: Re-exported from @cogni/ai-core (SINGLE_SOURCE_OF_TRUTH)
 * Side-effects: none (constants and types only)
 * Links: Used by billing schema, ports, adapters, UI components, and core/public.ts re-exports
 * @public
 */

// Re-export from canonical source (per SINGLE_SOURCE_OF_TRUTH invariant)
export { SOURCE_SYSTEMS, type SourceSystem } from "@cogni/ai-core";

/**
 * Charge reasons represent the economic/billing category of a charge.
 * Used for accounting, refunds, and financial analytics.
 */
export const CHARGE_REASONS = [
  "llm_usage",
  "image_generation",
  "subscription",
  "manual_adjustment",
  "promo_credit_consumption",
] as const;

export type ChargeReason = (typeof CHARGE_REASONS)[number];
