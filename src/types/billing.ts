// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@types/billing`
 * Purpose: Shared billing type definitions and categorization constants (logic-free).
 * Scope: Defines charge_reason and source_service enums for activity tracking. Does NOT implement business logic, pricing, or policy.
 * Invariants:
 * - ONLY exports: enums (as const arrays), literal union types, and simple string mappings
 * - FORBIDDEN: functions, computations, validation logic, or business rules
 * - charge_reason is for accounting/refunds, source_service is for UI/reports
 * - Lives in types/ layer to be importable by all layers (shared, ports, adapters, components, core)
 * Side-effects: none (constants and types only)
 * Links: Used by billing schema, ports, adapters, UI components, and core/public.ts re-exports
 * @public
 *
 * These enums define the two primary dimensions for activity tracking:
 * - charge_reason: Economic/billing category (for accounting, refunds, analytics)
 * - source_service: User-facing origin/channel (shown in Activity UI)
 *
 * When adding new entrypoints, expand these arrays and update SERVICE_LABELS.
 */

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

/**
 * Source systems represent the external system that originated a charge.
 * Used for generic linking in charge_receipts (source_system + source_reference).
 * Per GRAPH_EXECUTION.md: each adapter has a source system for billing attribution.
 */
export const SOURCE_SYSTEMS = ["litellm", "anthropic_sdk"] as const;

export type SourceSystem = (typeof SOURCE_SYSTEMS)[number];
