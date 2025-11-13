// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared`
 * Purpose: Shared utilities barrel export.
 * Scope: Re-exports common utilities, constants, and env validation. Does not contain business logic.
 * Invariants: Pure re-exports only, no side effects
 * Side-effects: none
 * Links: Used across all layers for common functionality
 * @public
 */

export * from "./constants";
export * from "./env";
export * from "./errors";
export * from "./util";
