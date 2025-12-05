// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/error.chat.v1.contract`
 * Purpose: Defines structured error types for chat UI error signaling.
 * Scope: Provides Zod schema and types for chat errors with retryability and suggested actions. Does not implement error handling logic.
 * Invariants: Contract remains stable; breaking changes require new version. All consumers use z.infer types.
 * Side-effects: none
 * Notes: Used by error mapper utilities and UI components for consistent error handling.
 * Links: ChatRuntimeProvider, ErrorAlert component
 * @public
 */

import { z } from "zod";

/**
 * Suggested action for error recovery
 * - retry: Transient error, can retry same request
 * - signin: Auth expired, redirect to sign in
 * - add_credits: Insufficient credits, prompt to add more
 * - switch_free: Paid model blocked, switch to free model
 */
export const SuggestedActionSchema = z.enum([
  "retry",
  "signin",
  "add_credits",
  "switch_free",
]);

export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

/**
 * Structured chat error for UI signaling
 * - code: Machine-readable error code (e.g., "INSUFFICIENT_CREDITS", "RATE_LIMIT")
 * - message: Human-readable error message for display
 * - httpStatus: Original HTTP status code (optional)
 * - requestId: Request ID for debugging/support (optional)
 * - retryable: Whether the error is transient and can be retried
 * - blocking: Whether the error blocks further chat attempts
 * - suggestedAction: Recommended user action for recovery (optional)
 */
export const ChatErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  httpStatus: z.number().optional(),
  requestId: z.string().optional(),
  retryable: z.boolean(),
  blocking: z.boolean(),
  suggestedAction: SuggestedActionSchema.optional(),
});

export type ChatError = z.infer<typeof ChatErrorSchema>;
