// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/constants/payments`
 * Purpose: Payment processing constants and reason strings.
 * Scope: Shared constants for payment features. Does not contain business logic.
 * Invariants: RESMIC_PAYMENT_REASON is the only allowed reason for Resmic payments.
 * Side-effects: none
 * Links: docs/RESMIC_PAYMENTS.md
 * @public
 */

/**
 * The singleton reason string for Resmic payments.
 * This is the ONLY allowed reason for minting credits via the Resmic confirm endpoint.
 * Enforced by cogni-git-review gate: resmic-payment-reason
 */
export const RESMIC_PAYMENT_REASON = "resmic_payment" as const;
