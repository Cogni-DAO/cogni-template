// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/scheduling/grant`
 * Purpose: DrizzleExecutionGrantAdapter for execution grant persistence.
 * Scope: Implements ExecutionGrantPort with Drizzle ORM. Does not contain business logic.
 * Invariants:
 * - Per GRANT_NOT_SESSION: Grants are durable, not session-based
 * - Per GRANT_SCOPES_CONSTRAIN_GRAPHS: Scope format is "graph:execute:{graphId}"
 * Side-effects: IO (database operations)
 * Links: ports/scheduling/execution-grant.port.ts, docs/SCHEDULER_SPEC.md
 * @public
 */

import { executionGrants } from "@cogni/db-schema/scheduling";

import {
  type ExecutionGrant,
  type ExecutionGrantPort,
  GrantExpiredError,
  GrantNotFoundError,
  GrantRevokedError,
  GrantScopeMismatchError,
} from "@cogni/scheduler-core";
import { and, eq, isNull } from "drizzle-orm";
import type { Database, LoggerLike } from "../client";

export class DrizzleExecutionGrantAdapter implements ExecutionGrantPort {
  private readonly logger: LoggerLike;

  constructor(
    private readonly db: Database,
    logger?: LoggerLike
  ) {
    this.logger = logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    };
  }

  async createGrant(input: {
    userId: string;
    billingAccountId: string;
    scopes: readonly string[];
    expiresAt?: Date;
  }): Promise<ExecutionGrant> {
    const [row] = await this.db
      .insert(executionGrants)
      .values({
        userId: input.userId,
        billingAccountId: input.billingAccountId,
        scopes: [...input.scopes],
        expiresAt: input.expiresAt ?? null,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create execution grant");
    }

    this.logger.info(
      { grantId: row.id, userId: input.userId },
      "Created execution grant"
    );

    return this.toGrant(row);
  }

  async validateGrant(grantId: string): Promise<ExecutionGrant> {
    const row = await this.db.query.executionGrants.findFirst({
      where: eq(executionGrants.id, grantId),
    });

    if (!row) {
      throw new GrantNotFoundError(grantId);
    }

    const now = new Date();

    if (row.revokedAt) {
      throw new GrantRevokedError(grantId, row.revokedAt);
    }

    if (row.expiresAt && row.expiresAt < now) {
      throw new GrantExpiredError(grantId, row.expiresAt);
    }

    return this.toGrant(row);
  }

  async validateGrantForGraph(
    grantId: string,
    graphId: string
  ): Promise<ExecutionGrant> {
    const grant = await this.validateGrant(grantId);

    const hasWildcard = grant.scopes.includes("graph:execute:*");
    const hasSpecificScope = grant.scopes.includes(`graph:execute:${graphId}`);

    if (!hasWildcard && !hasSpecificScope) {
      throw new GrantScopeMismatchError(grantId, graphId, grant.scopes);
    }

    return grant;
  }

  async revokeGrant(grantId: string): Promise<void> {
    await this.db
      .update(executionGrants)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(executionGrants.id, grantId), isNull(executionGrants.revokedAt))
      );

    this.logger.info({ grantId }, "Revoked execution grant");
  }

  async deleteGrant(grantId: string): Promise<void> {
    await this.db
      .delete(executionGrants)
      .where(eq(executionGrants.id, grantId));

    this.logger.info({ grantId }, "Deleted execution grant");
  }

  private toGrant(row: typeof executionGrants.$inferSelect): ExecutionGrant {
    return {
      id: row.id,
      userId: row.userId,
      billingAccountId: row.billingAccountId,
      scopes: row.scopes,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
    };
  }
}
