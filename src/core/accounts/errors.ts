// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/accounts/errors`
 * Purpose: Account domain errors and error handling.
 * Scope: Domain-specific errors for credit operations. Does not handle HTTP status codes or external error handling.
 * Invariants: Pure domain errors, no infrastructure concerns
 * Side-effects: none (error definitions only)
 * Notes: Structured error with contextual information for debugging and user feedback
 * Links: Used by domain functions, handled by features and adapters
 * @public
 */

/**
 * Domain error thrown when account has insufficient credits for operation
 * Contains structured information for error handling and user feedback
 */
export class InsufficientCreditsError extends Error {
  /** Error code for programmatic handling */
  public readonly code = "INSUFFICIENT_CREDITS" as const;

  constructor(
    /** Account ID that lacks credits */
    public readonly accountId: string,
    /** Required credit amount for operation */
    public readonly requiredCost: number,
    /** Current available credit balance */
    public readonly availableBalance: number
  ) {
    const shortfall = requiredCost - availableBalance;
    super(
      `Account ${accountId} has insufficient credits: need ${requiredCost}, have ${availableBalance} (shortfall: ${shortfall})`
    );
    this.name = "InsufficientCreditsError";
  }

  /**
   * Calculate credit shortfall amount
   * @returns The additional credits needed
   */
  get shortfall(): number {
    return Math.max(0, this.requiredCost - this.availableBalance);
  }
}

/**
 * Type guard to check if error is InsufficientCreditsError
 * @param error - Error to check
 * @returns true if error is InsufficientCreditsError
 */
export function isInsufficientCreditsError(
  error: unknown
): error is InsufficientCreditsError {
  return (
    error instanceof Error &&
    error.name === "InsufficientCreditsError" &&
    "code" in error &&
    (error as InsufficientCreditsError).code === "INSUFFICIENT_CREDITS"
  );
}
