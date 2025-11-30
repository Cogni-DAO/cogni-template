# Payment Testing Plan & Implementation

**Status:** Phase 1 Complete, Phase 2 Pending
**Purpose:** Systematic test coverage for payment system from core domain through full MVP scenarios

---

## Test Implementation Checklists

### Phase 1: Core Domain Unit Tests ✅ COMPLETE

**Purpose:** Test pure business logic with no I/O, no external dependencies

**Test Fixtures:**

- [x] `tests/_fakes/payments/payment-builders.ts` - PaymentAttempt builders
- [x] Export from `tests/_fakes/index.ts`

**Unit Tests - Business Rules (`tests/unit/core/payments/rules.test.ts`):**

- [x] State machine transitions - all 25 valid/invalid combinations
- [x] Terminal state detection - all 5 states
- [x] Client-visible status mapping - all 5 internal states
- [x] Payment amount validation - boundaries, invalid inputs, edge cases
- [x] Intent expiration logic - boundaries with FakeClock
- [x] Verification timeout logic - boundaries with FakeClock
- [x] Constants verification - MIN/MAX/TTL values

**Unit Tests - Utilities (`tests/unit/core/payments/util.test.ts`):**

- [x] USD cents to raw USDC conversion
- [x] Raw USDC to USD cents conversion
- [x] Roundtrip conversion verification - no precision loss

**Results:** 97 tests passing, `pnpm check` ✅

---

### Phase 2: Port Contract & Adapter Tests 🚧 IN PROGRESS

**Prerequisites:** Database migrations, adapter implementations

**Port Contract Tests:**

- [x] Create `tests/ports/harness/payment-attempt.port.harness.ts` - reusable harness with 7 invariant tests
  - [x] Repository creation test (create with CREATED_INTENT)
  - [x] Repository query test (findById enforces ownership)
  - [x] Repository query test (findByTxHash by chainId+txHash)
  - [x] Constraint test (bindTxHash uniqueness enforcement)
  - [x] Update test (recordVerificationAttempt increments count)
  - [x] Update test (updateStatus persists status+errorCode)
  - [x] Event logging test (logEvent audit trail)

**Test Helpers (no unit tests needed):**

- `FakeOnChainVerifierAdapter` - Configurable canned responder for integration/service tests
  - Used in Phase 3+ to simulate VERIFIED/PENDING/FAILED verification outcomes
  - Includes `lastCallParams` to assert verify() wiring in service tests
  - Value proven through usage, not unit tests of the fake itself

**Real Adapter Tests (`tests/unit/adapters/server/payments/`):**

- [ ] `drizzle.adapter.spec.ts` - PaymentAttemptRepository implementation
  - Passes port contract test suite
  - Drizzle type mapping
  - Database constraint handling
  - Transaction/locking behavior
- [ ] `ponder-onchain-verifier.adapter.spec.ts` - OnChainVerifier stub (MVP)
  - Returns VERIFIED for all inputs (stubbed)
  - TODO markers for Phase 3 real implementation

---

### Phase 3: Service Integration Tests ⏸️ DEFERRED

**Prerequisites:** Payment service implementation, DI container wiring

**Service Layer Tests (`tests/integration/payments/service.spec.ts`):**

- [ ] `createIntent()` - creates attempt, validates bounds, captures session wallet
- [ ] `submitTxHash()` - binds hash, checks expiration, transitions state
- [ ] `submitTxHash()` - idempotency (same attempt+hash returns 200)
- [ ] `submitTxHash()` - duplicate hash rejection (different attempt returns 409)
- [ ] `getStatus()` - returns current status, checks timeouts
- [ ] `getStatus()` - throttles verification attempts (10s window)
- [ ] Settlement flow - calls confirmCreditsPayment, atomic transaction
- [ ] Assert on both PaymentAttempt state AND fake.lastCallParams to prove verify() wiring

**API Contract Tests (`tests/integration/payments/api.spec.ts`):**

- [ ] POST /api/v1/payments/intents - request/response validation
- [ ] POST /api/v1/payments/attempts/:id/submit - request/response validation
- [ ] GET /api/v1/payments/attempts/:id - request/response validation
- [ ] HTTP error codes (400, 404, 409) for validation failures
- [ ] Authentication/authorization enforcement

---

### Phase 4: MVP Full-Flow Scenarios ⏸️ DEFERRED

**Prerequisites:** Full backend implementation (DB + adapters + services + APIs)

**Type:** Integration tests with database + fake verifier configured for specific outcomes

**Location:** `tests/integration/payments/mvp-flows.spec.ts`

**9 Critical MVP Scenarios (from PAYMENTS_DESIGN.md):**

- [ ] Sender mismatch → REJECTED with SENDER_MISMATCH
- [ ] Wrong token/recipient/amount → REJECTED with appropriate code
- [ ] Missing receipt → stays PENDING_UNVERIFIED (within 24h window)
- [ ] PENDING_UNVERIFIED timeout → FAILED after 24h with RECEIPT_NOT_FOUND
- [ ] Insufficient confirmations → stays PENDING_UNVERIFIED
- [ ] Duplicate submit (same attempt+hash) → 200 idempotent
- [ ] Same txHash different attempt → 409 conflict
- [ ] Atomic settle → verify no CREDITED without ledger entry (DB assertion)
- [ ] Ownership enforcement → not owned returns 404

**Test Strategy:** See "MVP Test Scenarios Strategy" section below for implementation details.

---

## Test Implementation Details

### Phase 1: Core Domain Tests (Completed)

**Location:** `tests/unit/core/payments/`

**Test Fixtures Design:**

Created `tests/_fakes/payments/payment-builders.ts` with 8 builder functions:

- `createPaymentAttempt()` - Base builder with deterministic defaults
- `createIntentAttempt()` - CREATED_INTENT state
- `createPendingAttempt()` - PENDING_UNVERIFIED state
- `createCreditedAttempt()` - CREDITED (terminal)
- `createRejectedAttempt()` - REJECTED (terminal)
- `createFailedAttempt()` - FAILED (terminal)
- `createExpiredIntent()` - Helper for expired intent scenarios
- `createTimedOutPending()` - Helper for timed-out pending scenarios

**Test Patterns:**

- No I/O, no time dependencies (uses FakeClock)
- Deterministic test data with sensible defaults
- Follows project patterns from `tests/unit/core/chat/rules.test.ts`

**Coverage:**

`rules.test.ts` - 71 tests covering:

- State machine: All 25 transition combinations tested
- Boundary conditions: Exact TTLs, just before/after, edge cases
- Time-based logic: FakeClock for deterministic time testing
- Validation: Amount bounds, invalid inputs (NaN, Infinity, non-integers)

`util.test.ts` - 26 tests covering:

- Forward/backward conversions
- Roundtrip verification (cents → raw → cents, raw → cents → raw)
- Precision validation (no loss for all valid amounts)
- Formula verification: 1 cent = 10,000 raw USDC units

**Results:**

```bash
pnpm test tests/unit/core/payments
# 97 tests passing
```

---

### Phase 2: Port Contract Testing (Pending)

**Pattern:** Port contract tests define behavior ALL adapters must implement.

**Example from existing codebase:** `tests/ports/wallet.viem.adapter.spec.ts`

**Implementation:**

1. Create reusable test suite function in `tests/ports/payment-attempt.contract.ts`
2. Each adapter imports and runs the contract suite
3. Contract tests use abstract factory pattern to test any implementation

**Port Contract Suite Structure:**

```typescript
/**
 * Contract test suite for PaymentAttemptRepository port
 * Any adapter implementing PaymentAttemptRepository MUST pass these tests
 */
export function paymentAttemptRepositoryContract(
  setup: () => Promise<{
    repository: PaymentAttemptRepository;
    cleanup: () => Promise<void>;
  }>
): void {
  describe("PaymentAttemptRepository contract", () => {
    // Creation tests
    describe("create()", () => {
      it("creates attempt with CREATED_INTENT status");
      it("generates unique ID");
      it("sets expiresAt correctly");
    });

    // Query tests
    describe("findById()", () => {
      it("returns attempt when owned");
      it("returns null when not owned");
      it("enforces ownership boundary");
    });

    // Update tests
    describe("bindTxHash()", () => {
      it("sets txHash and submittedAt");
      it("clears expiresAt");
      it("transitions to PENDING_UNVERIFIED");
      it("throws TxHashAlreadyBoundPortError for duplicates");
    });

    // ... more tests
  });
}
```

**Adapter Usage:**

```typescript
// tests/unit/adapters/server/payments/drizzle.adapter.spec.ts
import { paymentAttemptRepositoryContract } from "@tests/ports/payment-attempt.contract";

describe("DrizzlePaymentAttemptRepository", () => {
  // Run contract tests
  paymentAttemptRepositoryContract(async () => {
    const db = await setupTestDatabase();
    const repository = new DrizzlePaymentAttemptRepository(db);
    return {
      repository,
      cleanup: async () => await cleanupDatabase(db),
    };
  });

  // Adapter-specific tests
  describe("Drizzle-specific behavior", () => {
    it("handles database constraints correctly");
    // ...
  });
});
```

---

### Phase 3: Service Integration Testing (Pending)

**Type:** Integration tests requiring database + adapters

**Test Environment:**

- Real database (testcontainers or in-memory)
- FakeOnChainVerifierAdapter (configured for specific results)
- Real PaymentAttemptRepository adapter
- Real payment service

**Test Structure:**

```typescript
describe("Payment Service Integration", () => {
  let service: PaymentService;
  let db: Database;
  let verifier: FakeOnChainVerifierAdapter;

  beforeEach(async () => {
    db = await setupTestDatabase();
    verifier = new FakeOnChainVerifierAdapter();
    service = new PaymentService({
      repository: new DrizzlePaymentAttemptRepository(db),
      verifier,
    });
  });

  describe("createIntent()", () => {
    it("creates attempt with session wallet address", async () => {
      const session = createTestSession({ wallet: "0xABC..." });
      const result = await service.createIntent(session, 500);

      expect(result.fromAddress).toBe("0xABC...");
      expect(result.status).toBe("CREATED_INTENT");
    });

    it("validates amount bounds", async () => {
      await expect(
        service.createIntent(session, 99) // below min
      ).rejects.toThrow();
    });
  });

  describe("submitTxHash()", () => {
    it("binds hash and verifies transaction", async () => {
      // Configure verifier to return VERIFIED
      verifier.setResult("VERIFIED");

      const attempt = await service.createIntent(session, 500);
      const result = await service.submitTxHash(
        session,
        attempt.id,
        "0x123..."
      );

      expect(result.txHash).toBe("0x123...");
      expect(result.status).toBe("PENDING_UNVERIFIED");
    });

    it("rejects duplicate hash on different attempt", async () => {
      const attempt1 = await service.createIntent(session, 500);
      await service.submitTxHash(session, attempt1.id, "0x123...");

      const attempt2 = await service.createIntent(session, 500);
      await expect(
        service.submitTxHash(session, attempt2.id, "0x123...")
      ).rejects.toThrow(TxHashAlreadyBoundError);
    });
  });
});
```

---

## MVP Test Scenarios Strategy

### Overview

The **9 critical MVP scenarios** from PAYMENTS_DESIGN.md are **integration tests** that verify end-to-end payment flows including database persistence, state transitions, and business rule enforcement.

### Test Type: Integration Tests (NOT Unit Tests)

**Why Integration Tests:**

- Require database with migrations
- Require adapters (repository + verifier)
- Require service layer with full business logic
- Test atomic transactions and database constraints
- Test state machine flows across multiple operations

**Why NOT Unit Tests:**

- Cannot test database constraints without real DB
- Cannot test transaction atomicity without DB
- Cannot test adapter implementations in isolation

**Why NOT Stack/E2E Tests:**

- Don't need full HTTP server
- Don't need API layer
- Testing service layer directly is faster and more focused
- Can still verify all business requirements

### Implementation Approach

**Location:** `tests/integration/payments/mvp-scenarios.spec.ts`

**Test Environment Setup:**

```typescript
describe("MVP Payment Scenarios", () => {
  let db: Database;
  let repository: PaymentAttemptRepository;
  let verifier: FakeOnChainVerifierAdapter;
  let service: PaymentService;
  let session: SessionWithWallet;

  beforeEach(async () => {
    // Setup test database
    db = await createTestDatabase();
    await runMigrations(db);

    // Setup adapters
    repository = new DrizzlePaymentAttemptRepository(db);
    verifier = new FakeOnChainVerifierAdapter();

    // Setup service
    service = new PaymentService({
      repository,
      verifier,
      creditsService, // for settlement
    });

    // Setup test session
    session = createTestSession({
      billingAccountId: "test-account",
      wallet: "0xABC...",
    });
  });

  afterEach(async () => {
    await cleanupDatabase(db);
  });
});
```

**Test Scenarios:**

Each of the 9 scenarios configures `FakeOnChainVerifierAdapter` to return specific results, then verifies the payment flow behaves correctly.

#### Scenario 1: Sender Mismatch → REJECTED with SENDER_MISMATCH

```typescript
it("rejects payment when sender doesn't match session wallet", async () => {
  // Create intent with session wallet 0xABC...
  const attempt = await service.createIntent(session, 500);

  // Configure verifier to return different sender
  verifier.configureResult({
    status: "VERIFIED",
    actualFrom: "0xDEF...", // DIFFERENT from session wallet
    actualTo: attempt.toAddress,
    actualAmount: attempt.amountRaw,
  });

  // Submit transaction
  const result = await service.submitTxHash(session, attempt.id, "0x123...");

  // Verify attempt is REJECTED with correct error code
  expect(result.status).toBe("REJECTED");
  expect(result.errorCode).toBe("SENDER_MISMATCH");

  // Verify no credits were applied
  const balance = await getCreditsBalance(session.billingAccountId);
  expect(balance).toBe(0); // unchanged
});
```

#### Scenario 2: Wrong Token/Recipient/Amount → REJECTED

```typescript
it("rejects payment with wrong token address", async () => {
  const attempt = await service.createIntent(session, 500);

  verifier.configureResult({
    status: "FAILED",
    errorCode: "INVALID_TOKEN",
  });

  const result = await service.submitTxHash(session, attempt.id, "0x123...");

  expect(result.status).toBe("REJECTED");
  expect(result.errorCode).toBe("INVALID_TOKEN");
});

it("rejects payment with insufficient amount", async () => {
  const attempt = await service.createIntent(session, 500);

  verifier.configureResult({
    status: "VERIFIED",
    actualAmount: 4_000_000n, // Less than expected 5_000_000n
  });

  const result = await service.submitTxHash(session, attempt.id, "0x123...");

  expect(result.status).toBe("REJECTED");
  expect(result.errorCode).toBe("INSUFFICIENT_AMOUNT");
});
```

#### Scenario 3: Missing Receipt → PENDING_UNVERIFIED

```typescript
it("stays PENDING_UNVERIFIED when receipt not found", async () => {
  const attempt = await service.createIntent(session, 500);

  // Configure verifier to return PENDING (not indexed yet)
  verifier.configureResult({ status: "PENDING" });

  const result = await service.submitTxHash(session, attempt.id, "0x123...");

  expect(result.status).toBe("PENDING_UNVERIFIED");
  expect(result.errorCode).toBeNull();

  // Verify stays PENDING on subsequent getStatus calls (within 24h)
  const status = await service.getStatus(session, attempt.id);
  expect(status.status).toBe("PENDING_UNVERIFIED");
});
```

#### Scenario 4: PENDING_UNVERIFIED Timeout → FAILED

```typescript
it("transitions to FAILED after 24h timeout", async () => {
  const attempt = await service.createIntent(session, 500);

  verifier.configureResult({ status: "PENDING" });
  await service.submitTxHash(session, attempt.id, "0x123...");

  // Fast-forward time by 24 hours + 1 second
  const clock = new FakeClock();
  clock.advance(24 * 60 * 60 * 1000 + 1000);

  // Get status should detect timeout and transition to FAILED
  const result = await service.getStatus(session, attempt.id, clock.now());

  expect(result.status).toBe("FAILED");
  expect(result.errorCode).toBe("RECEIPT_NOT_FOUND");
});
```

#### Scenario 5: Insufficient Confirmations → PENDING

```typescript
it("stays PENDING_UNVERIFIED with insufficient confirmations", async () => {
  const attempt = await service.createIntent(session, 500);

  // Configure verifier to return VERIFIED but low confirmations
  verifier.configureResult({
    status: "VERIFIED",
    confirmations: 3, // Below MIN_CONFIRMATIONS (5)
  });

  const result = await service.submitTxHash(session, attempt.id, "0x123...");

  expect(result.status).toBe("PENDING_UNVERIFIED");

  // Should transition to CREDITED once confirmations increase
  verifier.configureResult({ confirmations: 5 });
  const updated = await service.getStatus(session, attempt.id);
  expect(updated.status).toBe("CREDITED");
});
```

#### Scenario 6: Duplicate Submit (Same Attempt+Hash) → 200 Idempotent

```typescript
it("returns existing status for duplicate submit", async () => {
  const attempt = await service.createIntent(session, 500);

  verifier.configureResult({ status: "VERIFIED" });

  // First submit
  const result1 = await service.submitTxHash(session, attempt.id, "0x123...");
  expect(result1.status).toBe("PENDING_UNVERIFIED");

  // Second submit with SAME hash - should be idempotent
  const result2 = await service.submitTxHash(session, attempt.id, "0x123...");
  expect(result2.status).toBe(result1.status);
  expect(result2.txHash).toBe(result1.txHash);

  // Should not create duplicate events or state changes
  const events = await repository.getEvents(attempt.id);
  const submitEvents = events.filter((e) => e.eventType === "TX_SUBMITTED");
  expect(submitEvents).toHaveLength(1); // Only one submit event
});
```

#### Scenario 7: Same TxHash Different Attempt → 409 Conflict

```typescript
it("rejects duplicate txHash on different attempt", async () => {
  // Create first attempt and bind hash
  const attempt1 = await service.createIntent(session, 500);
  verifier.configureResult({ status: "VERIFIED" });
  await service.submitTxHash(session, attempt1.id, "0x123...");

  // Create second attempt and try to use same hash
  const attempt2 = await service.createIntent(session, 500);

  await expect(
    service.submitTxHash(session, attempt2.id, "0x123...")
  ).rejects.toThrow(TxHashAlreadyBoundError);

  // Verify database constraint enforced (partial unique index)
  const dbAttempt = await repository.findByTxHash(11155111, "0x123...");
  expect(dbAttempt?.id).toBe(attempt1.id); // Still bound to first attempt
});
```

#### Scenario 8: Atomic Settle → No CREDITED Without Ledger Entry

```typescript
it("ensures atomic settlement: no CREDITED without credit_ledger entry", async () => {
  const attempt = await service.createIntent(session, 500);

  verifier.configureResult({ status: "VERIFIED" });
  await service.submitTxHash(session, attempt.id, "0x123...");

  // Verify settlement (this should trigger verification → settlement)
  const result = await service.getStatus(session, attempt.id);
  expect(result.status).toBe("CREDITED");

  // Verify credit_ledger entry exists
  const ledgerEntry = await db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.reference, `11155111:0x123...`))
    .limit(1);

  expect(ledgerEntry).toHaveLength(1);
  expect(ledgerEntry[0].amount).toBe(5000); // 500 cents = 5000 credits

  // Verify billing_accounts balance updated
  const account = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.id, session.billingAccountId))
    .limit(1);

  expect(account[0].creditBalance).toBe(5000);

  // Verify transaction atomicity: rollback leaves NO orphaned CREDITED status
  // (This is tested by triggering a settlement error and verifying rollback)
});
```

#### Scenario 9: Ownership Enforcement → Not Owned Returns 404

```typescript
it("enforces ownership: returns 404 for not-owned attempt", async () => {
  // Create attempt with one session
  const session1 = createTestSession({
    billingAccountId: "account-1",
    wallet: "0xABC...",
  });
  const attempt = await service.createIntent(session1, 500);

  // Try to access with different session
  const session2 = createTestSession({
    billingAccountId: "account-2",
    wallet: "0xDEF...",
  });

  await expect(service.getStatus(session2, attempt.id)).rejects.toThrow(
    PaymentNotFoundError
  );

  await expect(
    service.submitTxHash(session2, attempt.id, "0x123...")
  ).rejects.toThrow(PaymentNotFoundError);

  // Verify repository enforces ownership at DB level
  const found = await repository.findById(attempt.id, "account-2");
  expect(found).toBeNull();
});
```

### Blockchain Simulation: NOT Required for MVP

**Why No Forge/Anvil/Hardhat:**

- MVP uses **stub verification** (always returns VERIFIED)
- FakeOnChainVerifierAdapter provides complete control over verification results
- No need for real blockchain RPC calls
- No need for deploying contracts or mining blocks
- Faster test execution (no network latency)

**Phase 3 Consideration:**

When implementing real Ponder-backed verification on Base mainnet:

- May need Anvil fork for testing Ponder indexer
- May need deployed USDC contract on testnet
- FakeOnChainVerifierAdapter still sufficient for most service-layer tests

---

## Test Execution Commands

### Phase 1: Core Domain (Current)

```bash
pnpm test tests/unit/core/payments
# 97 tests passing
```

### Phase 2: Port Contracts & Adapters (Pending)

```bash
# Port contract tests
pnpm test tests/ports/payment-attempt.contract

# Adapter tests
pnpm test tests/unit/adapters/server/payments
pnpm test tests/unit/adapters/test/payments
```

### Phase 3: Service Integration (Pending)

```bash
# Requires database
pnpm test tests/integration/payments
```

### Phase 4: MVP Full Scenarios (Pending)

```bash
# All 9 critical scenarios
pnpm test tests/integration/payments/mvp-scenarios.spec.ts
```

---

## Related Documentation

- [PAYMENTS_DESIGN.md](PAYMENTS_DESIGN.md) - MVP spec & implementation checklist
- [TESTING.md](TESTING.md) - Test strategy & APP_ENV=test pattern
- [AGENTS.md](../AGENTS.md) - Workflow principles
- [tests/AGENTS.md](../tests/AGENTS.md) - Test layer boundaries
- [tests/unit/core/AGENTS.md](../tests/unit/core/AGENTS.md) - Core unit test standards
- [tests/ports/AGENTS.md](../tests/ports/AGENTS.md) - Port contract testing pattern
