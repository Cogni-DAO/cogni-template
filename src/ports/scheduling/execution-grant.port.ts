// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@ports/execution-grant`
 * Purpose: Execution grant port for scheduled graph authorization.
 * Scope: Defines contract for durable grants that authorize scheduled runs (not user sessions).
 * Invariants:
 * - Per GRANT_NOT_SESSION: Workers authenticate via grants, never user sessions
 * - Per GRANT_SCOPES_CONSTRAIN_GRAPHS: Scopes specify which graphIds can execute
 * - Scope format: "graph:execute:{graphId}" or "graph:execute:*" for wildcard
 * Side-effects: none (interface definition only)
 * Links: docs/SCHEDULER_SPEC.md, types/scheduling.ts, DrizzleExecutionGrantAdapter
 * @public
 */

import type { ExecutionGrant } from "@/types/scheduling";

// Re-export type for adapter convenience
export type { ExecutionGrant } from "@/types/scheduling";

/**
 * Port-level error thrown when grant is not found.
 */
export class GrantNotFoundError extends Error {
  constructor(public readonly grantId: string) {
    super(`Execution grant not found: ${grantId}`);
    this.name = "GrantNotFoundError";
  }
}

/**
 * Port-level error thrown when grant has expired.
 */
export class GrantExpiredError extends Error {
  constructor(
    public readonly grantId: string,
    public readonly expiresAt: Date
  ) {
    super(`Execution grant expired: ${grantId} at ${expiresAt.toISOString()}`);
    this.name = "GrantExpiredError";
  }
}

/**
 * Port-level error thrown when grant has been revoked.
 */
export class GrantRevokedError extends Error {
  constructor(
    public readonly grantId: string,
    public readonly revokedAt: Date
  ) {
    super(`Execution grant revoked: ${grantId} at ${revokedAt.toISOString()}`);
    this.name = "GrantRevokedError";
  }
}

/**
 * Port-level error thrown when grant scope does not include requested graphId.
 */
export class GrantScopeMismatchError extends Error {
  constructor(
    public readonly grantId: string,
    public readonly graphId: string,
    public readonly scopes: readonly string[]
  ) {
    super(
      `Grant ${grantId} does not authorize graph ${graphId}. Scopes: ${scopes.join(", ")}`
    );
    this.name = "GrantScopeMismatchError";
  }
}

export function isGrantNotFoundError(
  error: unknown
): error is GrantNotFoundError {
  return error instanceof Error && error.name === "GrantNotFoundError";
}

export function isGrantExpiredError(
  error: unknown
): error is GrantExpiredError {
  return error instanceof Error && error.name === "GrantExpiredError";
}

export function isGrantRevokedError(
  error: unknown
): error is GrantRevokedError {
  return error instanceof Error && error.name === "GrantRevokedError";
}

export function isGrantScopeMismatchError(
  error: unknown
): error is GrantScopeMismatchError {
  return error instanceof Error && error.name === "GrantScopeMismatchError";
}

/**
 * Execution grant port for scheduled graph authorization.
 */
export interface ExecutionGrantPort {
  /**
   * Creates a new execution grant for scheduled runs.
   * Note: virtualKeyId is resolved at runtime via AccountService, not stored in grant.
   */
  createGrant(input: {
    userId: string;
    billingAccountId: string;
    scopes: readonly string[];
    expiresAt?: Date;
  }): Promise<ExecutionGrant>;

  /**
   * Validates grant exists and is not expired/revoked.
   * @throws GrantNotFoundError, GrantExpiredError, GrantRevokedError
   */
  validateGrant(grantId: string): Promise<ExecutionGrant>;

  /**
   * Validates grant can execute specific graphId.
   * Per GRANT_SCOPES_CONSTRAIN_GRAPHS: checks scope includes graphId.
   * @throws GrantNotFoundError, GrantExpiredError, GrantRevokedError, GrantScopeMismatchError
   */
  validateGrantForGraph(
    grantId: string,
    graphId: string
  ): Promise<ExecutionGrant>;

  /**
   * Revokes a grant (soft delete via revoked_at timestamp).
   */
  revokeGrant(grantId: string): Promise<void>;

  /**
   * Deletes a grant permanently (hard delete).
   * Used for atomicity cleanup when schedule creation fails.
   */
  deleteGrant(grantId: string): Promise<void>;
}
