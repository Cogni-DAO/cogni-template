# Payments: USDC-on-Base with Backend Verification

**Status:** Design phase - ready for implementation

**Purpose:** MVP payment system with backend on-chain verification, durable state machine, zero vendor dependencies.

---

## 1. Implementation Checklist

### Phase 1: Backend (MVP - Critical Path)

**Core Domain:**

- [ ] Create `core/payments/model.ts` with PaymentAttempt entity
- [ ] Create `core/payments/rules.ts` for state transition validation
- [ ] Create `core/payments/errors.ts` with error types + error_code enum

**Ports:**

- [ ] Create `ports/payment.port.ts` with PaymentAttemptRepository and OnChainVerifier interfaces

**Database:**

- [ ] Migration: Create `payment_attempts` table per schema (include `from_address`, `error_code`, `submitted_at`, `last_verify_attempt_at`, `verify_attempt_count`)
- [ ] Migration: Add partial unique index on `(chain_id, tx_hash) WHERE tx_hash IS NOT NULL`
- [ ] Migration: Add unique constraint on `credit_ledger(reference)` for payments with chain awareness (see Persistence section for options)
- [ ] Migration: Create `payment_events` table
- [ ] Verify existing `(reference, reason)` index on credit_ledger

**Adapters:**

- [ ] Create `adapters/server/payments/drizzle.adapter.ts` (PaymentAttemptRepository)
- [ ] Create `adapters/server/payments/viem-verifier.adapter.ts` (OnChainVerifier)
  - Uses `getAddress()`, `isAddressEqual()` for addresses
  - Selects PublicClient by chain_id
  - Returns deterministic validation results

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

### Phase 3: Ponder Reconciliation (Post-MVP - Deferred)

See [PAYMENTS_PONDER_VERIFICATION.md](PAYMENTS_PONDER_VERIFICATION.md)

- [ ] Ponder indexes USDC Transfer events on Base
- [ ] Reconciliation job compares `payment_attempts` (CREDITED) vs indexed transfers
- [ ] Flags discrepancies for manual review
- [ ] Does NOT mutate balances (observability only)

---

### Phase 4: Ponder as Authoritative Source (Post-MVP - Deferred)

**Abstraction:** `PaymentStatusProvider` interface - UI reads row, doesn't care who updated it

**Cutover:**

1. Add config: `PAYMENT_VERIFICATION_MODE = 'direct_rpc' | 'ponder'`
2. Deploy Ponder worker (writes to payment_attempts)
3. Flip mode via env
4. Remove direct-rpc code path from GET
5. Delete viem-verifier.adapter.ts

**Result:** GET becomes pure read, verification only in worker. Polling stays as transport fallback.

---

## 2. MVP Summary

**Objective:** Accept USDC payments on Base mainnet with backend receipt verification before crediting.

**Flow:** Client creates intent → executes on-chain USDC transfer → submits txHash → backend verifies receipt → credits balance.

**Endpoints:**

- `POST /api/v1/payments/intents` - Create payment intent
- `POST /api/v1/payments/attempts/:id/submit` - Submit txHash for verification
- `GET /api/v1/payments/attempts/:id` - Poll status (with throttled verification)

**States:** `CREATED_INTENT` → `PENDING_UNVERIFIED` → `CREDITED` (+ terminal: `REJECTED`, `FAILED`)

**Three Invariants:**

1. **Sender binding:** Receipt sender MUST match session wallet (prevents txHash theft)
2. **Receipt validation:** Token/recipient/amount/confirmations MUST be verified on-chain
3. **Exactly-once credit:** DB constraints MUST prevent double-credit

---

## 2. Invariants (MUST)

### Security Invariants

- **MUST** capture `from_address` from SIWE session wallet at intent creation (checksum via `getAddress()`)
- **MUST** verify `isAddressEqual(receipt.from, from_address)` before crediting (prevents txHash theft)
- **MUST** verify receipt on Base RPC (select PublicClient by `attempt.chain_id`, implicit chain verification)
- **MUST** validate: `receipt.status === 'success'`, confirmations >= 5, token === USDC, recipient === DAO wallet, value >= amountRaw
- **MUST** be deterministic (no side effects until atomic settle commits)

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
  "chainId": 8453,
  "token": "0x833...",
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

## 5. Verification Rules

**When to verify:** On submit, and on GET poll (throttled)

**Verification MUST be deterministic** (no side effects until atomic settle)

**Validation checklist:**

- [ ] Select viem PublicClient by `attempt.chain_id` (Base mainnet = 8453)
- [ ] Fetch receipt via `getTransactionReceipt({ hash })`
  - If not found → stay PENDING_UNVERIFIED (error_code: `RECEIPT_NOT_FOUND`)
- [ ] Check `receipt.status === 'success'`
  - If reverted → transition to FAILED (error_code: `TX_REVERTED`)
- [ ] Verify sender: `isAddressEqual(receipt.from, attempt.from_address)`
  - If mismatch → transition to REJECTED (error_code: `SENDER_MISMATCH`)
- [ ] Check confirmations: `currentBlockHeight - receipt.blockNumber >= 5`
  - If insufficient → stay PENDING_UNVERIFIED (error_code: `INSUFFICIENT_CONFIRMATIONS`)
- [ ] Parse Transfer logs: filter where `log.address === USDC_TOKEN_ADDRESS`
- [ ] Find matching transfer: `isAddressEqual(decoded.to, DAO_WALLET) AND decoded.value >= attempt.amountRaw`
  - If no match → transition to REJECTED (error_code: `INVALID_TOKEN|INVALID_RECIPIENT|INSUFFICIENT_AMOUNT`)
- [ ] **Atomic settle:** Settlement MUST be exactly-once and atomic. Implemented exclusively inside `confirmCreditsPayment()` which performs ledger insert + balance update + attempt CREDITED transition in one DB transaction. Pass composite reference: `clientPaymentId = "${chainId}:${txHash}"` for chain-aware idempotency.
- [ ] Log event to `payment_events` (after successful credit)

**Chain verification:** Implicit - if txHash on wrong chain, Base RPC won't find it → stays PENDING_UNVERIFIED → times out after 24h.

**PENDING_UNVERIFIED timeout:** Prevents zombie attempts. After 24h from submit (or N verification attempts), transition to FAILED with error_code `RECEIPT_NOT_FOUND`.

---

## 6. Persistence & Idempotency

### payment_attempts Table

**Location:** `src/shared/db/schema.billing.ts`

**Key Columns:**

- `id` (UUID, PK) - attemptId
- `billing_account_id` (TEXT, FK) - owner (TEXT matches existing schema)
- `from_address` (TEXT, NOT NULL) - SIWE wallet checksummed via `getAddress()`
- `chain_id` (INTEGER) - Base mainnet (8453)
- `tx_hash` (TEXT, nullable) - bound on submit
- `token` (TEXT), `to_address` (TEXT), `amount_raw` (BIGINT), `amount_usd_cents` (INTEGER)
- `status` (TEXT) - state enum
- `error_code` (TEXT, nullable) - stable error enum
- `expires_at` (TIMESTAMP, nullable) - NULL after submit (only for CREATED_INTENT)
- `submitted_at` (TIMESTAMP, nullable) - set when txHash bound (for PENDING_UNVERIFIED timeout)
- `last_verify_attempt_at` (TIMESTAMP, nullable) - for GET throttle
- `verify_attempt_count` (INTEGER, default 0) - incremented on each verification attempt

**Required Indexes:**

- **Partial unique index:** `(chain_id, tx_hash) WHERE tx_hash IS NOT NULL`
- `(billing_account_id, created_at)` - user history
- `(status, created_at)` - polling

---

### payment_events Table (Mandatory)

**Purpose:** Append-only audit log (critical for Ponder reconciliation + disputes)

**Key Columns:**

- `id` (UUID, PK)
- `attempt_id` (UUID, FK)
- `event_type` (TEXT) - `INTENT_CREATED`, `TX_SUBMITTED`, `VERIFICATION_ATTEMPTED`, `CREDITED`, `REJECTED`, `FAILED`, `EXPIRED`
- `from_status` (TEXT, nullable), `to_status` (TEXT)
- `error_code` (TEXT, nullable)
- `metadata` (JSONB) - txHash, blockNumber, validation details
- `created_at` (TIMESTAMP)

---

### credit_ledger Unique Constraint

**MUST enforce exactly-once credit at DB level with chain awareness:**

**Two options:**

**(A) Add chain_id column to credit_ledger:**

```sql
ALTER TABLE credit_ledger ADD COLUMN chain_id INTEGER;
CREATE UNIQUE INDEX credit_ledger_payment_ref_unique
ON credit_ledger(chain_id, reference)
WHERE reason = 'widget_payment';
```

**(B) Use composite reference format:**

```sql
-- reference format: "${chainId}:${txHash}"
CREATE UNIQUE INDEX credit_ledger_payment_ref_unique
ON credit_ledger(reference)
WHERE reason = 'widget_payment';
```

**Recommendation:** Option B (composite reference) is simpler for MVP. Choose option A for future multi-chain/multi-rail support.

**Existing:** Index on `(reference, reason)` provides lookup but may not enforce uniqueness. Add explicit unique constraint.

---

### Exactly-Once Summary

**Three layers:**

1. **Partial unique index** on `payment_attempts(chain_id, tx_hash)` - prevents same txHash across attempts
2. **Unique constraint** on `credit_ledger(reference)` for payments with chain awareness - DB-level exactly-once (see options above)
3. **FOR UPDATE lock** in settlement transaction - prevents race conditions

**Chain awareness in ledger:** Reference MUST include chain context to prevent collisions. Use composite reference `"${chainId}:${txHash}"` (option B) for MVP simplicity.

---

## 7. Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal architecture boundaries
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md) - Credit accounting
- [PAYMENTS_PONDER_VERIFICATION.md](PAYMENTS_PONDER_VERIFICATION.md) - Post-MVP reconciliation

**Key Config:**

- `src/shared/web3/chain.ts` - USDC_TOKEN_ADDRESS, CHAIN_ID, payment constants
- `src/shared/config/repoSpec.server.ts` - `getWidgetConfig().receivingAddress` for DAO wallet
- `.cogni/repo-spec.yaml` - Governance-managed receiving address

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
