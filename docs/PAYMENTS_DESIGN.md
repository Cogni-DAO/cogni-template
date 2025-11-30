# Payments: USDC with Backend Verification

**MVP Chain:** Ethereum Sepolia (11155111) — **Phase 3 Chain:** Base mainnet (8453)

**Status:** Design phase - ready for implementation

**Purpose:** MVP payment system with durable state machine, two-port architecture (PaymentAttemptRepository + OnChainVerifier), stub verification on Ethereum Sepolia. Real Ponder-backed verification deferred to Phase 3 (Base mainnet).

---

## 1. Implementation Checklist

### Phase 1: Backend (MVP - Critical Path)

**Core Domain:**

- [x] Create `core/payments/model.ts` with PaymentAttempt entity
- [x] Create `core/payments/rules.ts` for state transition validation
- [x] Create `core/payments/errors.ts` with error types + error_code enum
- [x] Create `core/payments/util.ts` for conversion utilities
- [x] Create `core/payments/public.ts` barrel export

**Ports:**

- [x] Create `ports/payment-attempt.port.ts` with PaymentAttemptRepository interface
- [x] Create `ports/onchain-verifier.port.ts` with OnChainVerifier interface (no Ponder-specific types)
- [x] Export from `ports/index.ts`

**Database:**

- [x] Schema: Add `payment_attempts` table to `schema.billing.ts`
- [x] Schema: Add `payment_events` table to `schema.billing.ts`
- [x] Schema: Add partial unique index `payment_attempts_chain_tx_unique` on `(chain_id, tx_hash) WHERE tx_hash IS NOT NULL`
- [x] Schema: Add unique index `credit_ledger_payment_ref_unique` on `(reference) WHERE reason = 'widget_payment'`
- [x] Migration: Run `pnpm db:generate` to create migration file (0002_flimsy_microchip.sql)
- [ ] Migration: Run `pnpm db:migrate` to apply migration (deferred until stack running)

**Adapters:**

- [x] Create `adapters/server/payments/drizzle-payment-attempt.adapter.ts` (PaymentAttemptRepository)
- [x] Create `adapters/server/payments/ponder-onchain-verifier.adapter.ts` (OnChainVerifier - stubbed now, real Ponder in Phase 3)
- [x] Create `adapters/test/payments/fake-onchain-verifier.adapter.ts` (OnChainVerifier - deterministic fake for tests)
- [x] Export from `adapters/server/index.ts` and `adapters/test/index.ts`
- [x] Wire in `bootstrap/container.ts`: production uses PonderOnChainVerifierAdapter, test uses FakeOnChainVerifierAdapter

**Feature Service:**

- [ ] Create `features/payments/services/paymentService.ts`
- [ ] `createIntent()` - captures from_address, validates bounds
- [ ] `submitTxHash()` - checks expiration, sets expires_at = NULL, sets submitted_at = now(), verifies
- [ ] `getStatus()` - checks PENDING_UNVERIFIED timeout (24h from submitted_at or N attempts), transitions to FAILED if exceeded
- [ ] Ensure `confirmCreditsPayment()` owns CREDITED transition inside atomic transaction
- [ ] Ensure payment_attempts remains PENDING_UNVERIFIED until credit transaction commits

**API Routes:**

- [ ] Create `contracts/payments.intent.v1.contract.ts`
- [ ] Create `contracts/payments.submit.v1.contract.ts`
- [ ] Create `contracts/payments.status.v1.contract.ts`
- [ ] Create `app/api/v1/payments/intents/route.ts`
- [ ] Create `app/api/v1/payments/attempts/[id]/submit/route.ts`
- [ ] Create `app/api/v1/payments/attempts/[id]/route.ts`

**Constants** (add to `src/shared/web3/chain.ts`):

- `MIN_PAYMENT_CENTS = 100`, `MAX_PAYMENT_CENTS = 1_000_000`
- `MIN_CONFIRMATIONS = 5`
- `PAYMENT_INTENT_TTL_MS = 30 * 60 * 1000` (30 min for CREATED_INTENT)
- `PENDING_UNVERIFIED_TTL_MS = 24 * 60 * 60 * 1000` (24h for stuck PENDING_UNVERIFIED)
- `VERIFY_THROTTLE_SECONDS = 10` (GET polling throttle)

**MVP Tests (9 critical scenarios):**

- [ ] Sender mismatch → REJECTED with SENDER_MISMATCH
- [ ] Wrong token/recipient/amount → REJECTED with appropriate code
- [ ] Missing receipt → stays PENDING_UNVERIFIED (within 24h window)
- [ ] PENDING_UNVERIFIED timeout → FAILED after 24h from submit with RECEIPT_NOT_FOUND
- [ ] Insufficient confirmations → stays PENDING_UNVERIFIED
- [ ] Duplicate submit (same attempt+hash) → 200 idempotent
- [ ] Same txHash different attempt → 409
- [ ] Atomic settle: verify no CREDITED without ledger entry (DB assertion)
- [ ] Ownership: not owned → 404

---

### Phase 2: Frontend (MVP - Required)

**Feature Hook:**

- [ ] Create `features/payments/hooks/usePaymentFlow.ts`
  - Calls backend endpoints (intent, submit, status)
  - Uses wagmi `useWriteContract` + `useWaitForTransactionReceipt` for USDC transfer
  - Derives 3-state UI projection (READY/PENDING/DONE) from backend status
  - NO localStorage, polls backend for truth

**Kit Component:**

- [ ] Create `components/kit/payments/UsdcPaymentFlow.tsx`
  - Presentational only: state prop + callbacks
  - 3 states: READY (show amount + button), PENDING (wallet + chain status), DONE (success/error)
  - NO business logic

**App Integration:**

- [ ] Update `app/(app)/credits/CreditsPage.client.tsx`
  - Replace DePay widget with `UsdcPaymentFlow`
  - Use `usePaymentFlow` hook
  - Poll backend for status updates
  - Refresh balance on CREDITED

**DePay Removal:**

- [ ] Delete `src/components/vendor/depay/` directory
- [ ] Remove `@depay/widgets` from package.json
- [ ] Remove DePay-specific code and imports

**Frontend Tests:**

- [ ] 3-state projection renders correctly from backend states
- [ ] Polling updates status in real-time
- [ ] Error messages display correctly

**Deferred Frontend Tests (Post-MVP):**

- Transaction replacement edge cases, multiple transfer logs UI handling, address case sensitivity UX

---

### Phase 3: Ponder-Backed Verification (Post-MVP - Deferred)

**Objective:** Wire real Ponder queries into PonderOnChainVerifierAdapter. Switch to Base mainnet.

- [ ] Deploy Ponder indexer for USDC Transfer events to DAO wallet
- [ ] Implement real verification logic in `ponder-onchain-verifier.adapter.ts`
- [ ] Update `.cogni/repo-spec.yaml` chain_id to Base mainnet (8453)
- [ ] Add failure handling: sender mismatch, wrong token, insufficient amount, reorgs

---

### Phase 4: Reconciliation & Hardening (Post-MVP - Deferred)

See [PAYMENTS_PONDER_VERIFICATION.md](PAYMENTS_PONDER_VERIFICATION.md)

- [ ] Reconciliation job compares `payment_attempts` (CREDITED) vs Ponder-indexed transfers
- [ ] Clear stuck PENDING attempts after max verification TTL
- [ ] Monitoring and alerting for verification failures
- [ ] Audit log queries for dispute resolution

---

## 2. MVP Summary

**Objective:** Accept USDC payments on Ethereum Sepolia with stub verification. Real Ponder-backed verification on Base mainnet in Phase 3.

**Scope:** Single chain (Ethereum Sepolia 11155111), single token (USDC), single payment type (credit_topup). No multi-chain, refunds, partial fills, or subscriptions.

**Flow:** Client creates attempt → executes on-chain USDC transfer → submits txHash → backend calls OnChainVerifier (stubbed: always VERIFIED) → credits balance.

**Endpoints:**

- `POST /api/v1/payments/intents` - Create payment intent
- `POST /api/v1/payments/attempts/:id/submit` - Submit txHash for verification
- `GET /api/v1/payments/attempts/:id` - Poll status (with throttled verification)

**Internal States:** `CREATED_INTENT` → `PENDING_UNVERIFIED` → `CREDITED` (+ terminal: `REJECTED`, `FAILED`)

**Client-Visible States:** `PENDING_VERIFICATION` | `CONFIRMED` | `FAILED` (maps from internal states)

**Three Invariants:**

1. **Sender binding:** Receipt sender MUST match session wallet (Phase 3 - stubbed in MVP)
2. **Receipt validation:** Token/recipient/amount MUST be verified via OnChainVerifier (Phase 3 - stubbed in MVP)
3. **Exactly-once credit:** DB constraints MUST prevent double-credit

---

## 2. Invariants (MUST)

### Security Invariants

- **MUST** capture `from_address` from SIWE session wallet at attempt creation (checksum via `getAddress()`)
- **MUST** call OnChainVerifier port before crediting (stubbed in MVP, real Ponder in Phase 3)
- **MUST** match token_address to canonical USDC on configured chain (Ethereum Sepolia for MVP)
- **MUST** require `amount >= expected_usdc_amount` (enforced by OnChainVerifier in Phase 3)
- **MUST** never trust client-supplied txHash for crediting - verification is backend-only

### Ownership Invariants

- **MUST** filter all queries by `billing_account_id === session.billing_account_id` (prevents privilege escalation)
- **MUST** return 404 if attempt not owned by session user

### Idempotency Invariants

- **MUST** apply credits exactly-once per payment reference (DB constraint enforced)
- **MUST NOT** allow same txHash to credit twice (partial unique index on attempts + unique constraint on ledger)
- **MUST** keep attempt PENDING_UNVERIFIED until atomic credit transaction commits
- Settlement **MUST** be atomic across: credit_ledger insert, billing_accounts update, payment_attempts CREDITED transition

### TTL Invariants

- **MUST** enforce `expires_at` ONLY in `CREATED_INTENT` state (30 min TTL)
- **MUST** set `expires_at = NULL` on txHash submission
- **MUST** terminate stuck PENDING_UNVERIFIED attempts after excessive verification attempts (prevents zombie attempts + infinite polling costs)
  - If receipt not found after 24 hours from submission (or N verification attempts) → transition to FAILED with error_code `RECEIPT_NOT_FOUND`
  - Track via `submitted_at` timestamp and verification attempt count
  - Legitimate on-chain txs confirm within minutes; 24h timeout catches wrong-chain/invalid submissions

---

## 3. State Machine

### Canonical States

- `CREATED_INTENT` - Intent created, awaiting on-chain transfer
- `PENDING_UNVERIFIED` - TxHash submitted, verification in progress
- `CREDITED` - Credits applied (terminal success)
- `REJECTED` - Verification failed (terminal)
- `FAILED` - Transaction reverted or intent expired (terminal)

### Allowed Transitions

```
CREATED_INTENT -> PENDING_UNVERIFIED (on submit)
CREATED_INTENT -> FAILED (on intent expiration)
PENDING_UNVERIFIED -> CREDITED (on successful verification)
PENDING_UNVERIFIED -> REJECTED (on validation failure)
PENDING_UNVERIFIED -> FAILED (on tx revert OR receipt not found after 24h)
```

### State Transition Ownership

- `confirmCreditsPayment()` (or equivalent) **MUST** be the single owner of the CREDITED transition
- Attempt **MUST NOT** become CREDITED unless ledger+balance update commits

---

## 4. API Contracts

### POST /api/v1/payments/intents

**Purpose:** Create intent, return on-chain params

**Request:** `{ amountUsdCents: number }`

**Validation:**

- **MUST** reject if `amountUsdCents < 100` or `> 1_000_000` (400 error)

**Response:**

```json
{
  "attemptId": "uuid",
  "chainId": 11155111,
  "token": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "to": "0x070...",
  "amountRaw": "string",
  "amountUsdCents": 500,
  "expiresAt": "ISO8601"
}
```

**Backend MUST:**

- Resolve `billing_account_id` from session
- Capture `from_address = getAddress(sessionWallet)` (checksummed)
- Calculate `amountRaw = BigInt(amountUsdCents) * 10_000n` (never use floats)
- Set `expires_at = now() + 30min`
- Get DAO wallet from `getWidgetConfig().receivingAddress`

---

### POST /api/v1/payments/attempts/:id/submit

**Purpose:** Submit txHash, verify, settle if valid

**Request:** `{ txHash: string }`

**Response:**

```json
{
  "attemptId": "uuid",
  "status": "PENDING_UNVERIFIED|CREDITED|REJECTED|FAILED",
  "txHash": "0x...",
  "errorCode": "SENDER_MISMATCH|...",
  "errorMessage": "string"
}
```

**Backend MUST:**

- Enforce ownership: `attempt.billing_account_id === session.billing_account_id`
- Check expiration: if `status === 'CREATED_INTENT' AND expires_at < now()` → transition to FAILED, return
- Bind txHash (idempotent: if already bound to this hash, continue)
- **Set `expires_at = NULL`** (submitted attempts do not use intent TTL)
- **Set `submitted_at = now()`** (for PENDING_UNVERIFIED timeout tracking)
- Transition to PENDING_UNVERIFIED
- Attempt verification (see Verification Rules section)

**Idempotency:**

- Same txHash + same attemptId: return existing status (200)
- Same txHash + different attemptId: reject (409 conflict)

---

### GET /api/v1/payments/attempts/:id

**Purpose:** Poll status (with throttled verification)

**Response:**

```json
{
  "attemptId": "uuid",
  "status": "string",
  "txHash": "0x...",
  "amountUsdCents": 500,
  "errorCode": "string",
  "createdAt": "ISO8601"
}
```

**Backend MUST:**

- Enforce ownership
- Check expiration (CREATED_INTENT only)
- **Check PENDING_UNVERIFIED timeout:** If `status === 'PENDING_UNVERIFIED' AND (now() - submitted_at > 24h OR verify_attempt_count > N)`:
  - Transition to FAILED with error_code `RECEIPT_NOT_FOUND`
- **Throttle verification:** If `status === 'PENDING_UNVERIFIED'` and not timed out:
  - If `last_verify_attempt_at IS NULL` OR `now() - last_verify_attempt_at >= 10 seconds`:
    - Update `last_verify_attempt_at = now()`
    - Increment `verify_attempt_count`
    - Attempt verification
  - Else: skip (reduce RPC cost)
- Return current status

---

## 5. OnChainVerifier Port

**Interface:** `verify(chainId, txHash, expectedTo, expectedToken, expectedAmount) → { status, actualFrom, actualTo, actualAmount, errorCode }`

**Status values:** `VERIFIED` | `PENDING` | `FAILED`

**MVP (PonderOnChainVerifierAdapter stubbed):** Always returns `{ status: VERIFIED }` - real validation deferred to Phase 3.

**Phase 3+ (PonderOnChainVerifierAdapter real):** Queries Ponder-indexed USDC Transfer events on Base mainnet (8453):

- [ ] Query Ponder for Transfer event matching txHash
  - If not indexed → stay PENDING_UNVERIFIED (error_code: `RECEIPT_NOT_FOUND`)
- [ ] Validate indexed event: tx succeeded, sufficient confirmations
  - If reverted → transition to FAILED (error_code: `TX_REVERTED`)
- [ ] Verify sender from indexed data: `from === attempt.from_address`
  - If mismatch → transition to REJECTED (error_code: `SENDER_MISMATCH`)
- [ ] Verify recipient from indexed data: `to === DAO_WALLET`
  - If mismatch → transition to REJECTED (error_code: `INVALID_RECIPIENT`)
- [ ] Verify amount from indexed data: `value >= attempt.amountRaw`
  - If insufficient → transition to REJECTED (error_code: `INSUFFICIENT_AMOUNT`)
- [ ] **Atomic settle:** Settlement MUST be exactly-once and atomic. Implemented exclusively inside `confirmCreditsPayment()` which performs ledger insert + balance update + attempt CREDITED transition in one DB transaction. Pass composite reference: `clientPaymentId = "${chainId}:${txHash}"` for chain-aware idempotency.
- [ ] Log event to `payment_events` (after successful credit)

**Chain verification (Phase 3):** If txHash on wrong chain, Ponder won't find it → stays PENDING_UNVERIFIED → times out.

**PENDING_UNVERIFIED timeout:** Prevents zombie attempts. After 24h from submit (or N verification attempts), transition to FAILED with error_code `RECEIPT_NOT_FOUND`.

---

## 6. Persistence & Idempotency

### payment_attempts Table

**Location:** `src/shared/db/schema.billing.ts`

**Key Columns:**

- `id` (UUID, PK, default gen_random_uuid()) - attemptId
- `billing_account_id` (TEXT, NOT NULL, FK → billing_accounts) - owner
- `from_address` (TEXT, NOT NULL) - SIWE wallet checksummed via `getAddress()`
- `chain_id` (INTEGER) - Ethereum Sepolia (11155111) for MVP, Base mainnet (8453) in Phase 3
- `tx_hash` (TEXT, nullable) - bound on submit
- `token` (TEXT), `to_address` (TEXT), `amount_raw` (BIGINT), `amount_usd_cents` (INTEGER)
- `status` (TEXT) - state enum
- `error_code` (TEXT, nullable) - stable error enum
- `expires_at` (TIMESTAMP, nullable) - NULL after submit (only for CREATED_INTENT)
- `submitted_at` (TIMESTAMP, nullable) - set when txHash bound (for PENDING_UNVERIFIED timeout)
- `last_verify_attempt_at` (TIMESTAMP, nullable) - for GET throttle
- `verify_attempt_count` (INTEGER, NOT NULL, default 0) - incremented on each verification attempt
- `created_at` (TIMESTAMP, NOT NULL, default now())

**Required Indexes:**

- `payment_attempts_chain_tx_unique` - Partial unique: `(chain_id, tx_hash) WHERE tx_hash IS NOT NULL`
- `payment_attempts_billing_account_idx` - `(billing_account_id, created_at)` for user history
- `payment_attempts_status_idx` - `(status, created_at)` for polling

---

### payment_events Table (Mandatory)

**Purpose:** Append-only audit log (critical for Ponder reconciliation + disputes)

**Schema:**

- `id` (UUID, PK, default gen_random_uuid())
- `attempt_id` (UUID, NOT NULL, FK → payment_attempts)
- `event_type` (TEXT, NOT NULL) - Operation verbs: `INTENT_CREATED`, `TX_SUBMITTED`, `VERIFICATION_ATTEMPTED`, `STATUS_CHANGED`
- `from_status` (TEXT, nullable) - Previous PaymentAttemptStatus (null for INTENT_CREATED)
- `to_status` (TEXT, NOT NULL) - New PaymentAttemptStatus
- `error_code` (TEXT, nullable) - PaymentErrorCode for failure events
- `metadata` (JSONB, nullable) - txHash, blockNumber, validation details
- `created_at` (TIMESTAMP, NOT NULL, default now())

**Event semantics:** event_type describes the operation (verb); from_status/to_status hold the actual states.

**Index:**

- `payment_events_attempt_idx` - `(attempt_id, created_at)` for audit log queries

---

### credit_ledger Unique Constraint

**MUST enforce exactly-once credit at DB level with chain awareness:**

```sql
CREATE UNIQUE INDEX credit_ledger_payment_ref_unique
ON credit_ledger(reference)
WHERE reason = 'widget_payment';
```

**Reference format:** `"${chainId}:${txHash}"` (e.g., `"11155111:0xabc123..."`)

**Implementation:** Feature service passes composite reference to `confirmCreditsPayment()` for idempotency.

---

### Exactly-Once Summary

**Three layers:**

1. **Partial unique index** on `payment_attempts(chain_id, tx_hash)` - prevents same txHash across attempts
2. **Unique constraint** on `credit_ledger(reference)` for payments - DB-level exactly-once with composite reference
3. **FOR UPDATE lock** in settlement transaction - prevents race conditions

**Chain awareness in ledger:** Reference MUST include chain context to prevent collisions. Use composite reference `"${chainId}:${txHash}"`.

---

## 7. Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal architecture boundaries
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md) - Credit accounting
- [PAYMENTS_PONDER_VERIFICATION.md](PAYMENTS_PONDER_VERIFICATION.md) - Post-MVP reconciliation

**Key Config:**

- `src/shared/web3/chain.ts` - USDC_TOKEN_ADDRESS, CHAIN_ID, payment constants (Ethereum Sepolia for MVP)
- `src/shared/config/repoSpec.server.ts` - `getWidgetConfig().receivingAddress` for DAO wallet
- `.cogni/repo-spec.yaml` - Governance-managed receiving address and chain_id (update to 8453 in Phase 3)

**Existing Credit Logic:**

- `src/features/payments/services/creditsConfirm.ts` - `confirmCreditsPayment()` handles virtualKeyId, balanceAfter, atomic updates
- Reuse this for settlement, ensure it owns CREDITED transition
- Pass composite reference: `clientPaymentId = "${chainId}:${txHash}"` for chain-aware idempotency

**Unit Conversions:**

- `amount_raw` = USDC raw units (6 decimals, 1 USDC = 1,000,000 raw)
- `amount_usd_cents` = USD cents (1 USD = 100 cents)
- `credits` = internal accounting (1 cent = 10 credits per `CREDITS_PER_CENT` constant)
- Conversion: 1 USDC = 100 cents = 1,000 credits

**Error Codes:**
`SENDER_MISMATCH`, `INVALID_TOKEN`, `INVALID_RECIPIENT`, `INSUFFICIENT_AMOUNT`, `INSUFFICIENT_CONFIRMATIONS`, `TX_REVERTED`, `RECEIPT_NOT_FOUND`, `INTENT_EXPIRED`, `RPC_ERROR`
