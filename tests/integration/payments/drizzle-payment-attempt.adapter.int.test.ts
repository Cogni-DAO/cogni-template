// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/integration/payments/drizzle-payment-attempt.adapter`
 * Purpose: Integration tests for DrizzlePaymentAttemptRepository with real PostgreSQL database.
 * Scope: Tests adapter implementation against port contract with testcontainers. Does NOT test business logic.
 * Invariants: Adapter passes all 7 port contract tests; ownership enforced; txHash uniqueness maintained; events logged.
 * Side-effects: IO (database operations via testcontainers)
 * Notes: Uses port harness for reusable contract tests; runs with testcontainers PostgreSQL via vitest.integration.config.
 * Links: PaymentAttemptRepository port, payment-attempt.port.harness.ts
 * @public
 */

import { getDb } from "@/adapters/server/db/client";
import { DrizzlePaymentAttemptRepository } from "@/adapters/server/payments/drizzle-payment-attempt.adapter";
import type { TestHarness } from "../../ports/harness/factory";
import { registerPaymentAttemptRepositoryContract } from "../../ports/harness/payment-attempt.port.harness";

/**
 * Factory function that creates a DrizzlePaymentAttemptRepository for port contract testing.
 * Uses the database connection from testcontainers setup.
 */
async function makeDrizzleRepository(
  _harness: TestHarness
): Promise<DrizzlePaymentAttemptRepository> {
  const db = getDb();
  return new DrizzlePaymentAttemptRepository(db);
}

/**
 * Register DrizzlePaymentAttemptRepository with the port contract test suite.
 * This ensures the Drizzle adapter correctly implements all required port behaviors:
 * - Creates payment attempts with CREATED_INTENT status
 * - Enforces ownership via billingAccountId filtering
 * - Finds by composite key (chainId, txHash)
 * - Enforces txHash uniqueness per chain via partial unique index
 * - Records verification attempts with timestamp and count
 * - Updates status atomically with audit logging
 * - Logs all events to audit trail
 */
registerPaymentAttemptRepositoryContract(makeDrizzleRepository);
