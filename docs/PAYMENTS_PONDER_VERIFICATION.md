# Payments: Ponder-Backed Verification & Reconciliation

**MVP Status:** Deferred to Phase 3+
**Target Chain:** Base mainnet (8453)
**Prerequisites:** MVP backend-verified payments system operational on Ethereum Sepolia

**Purpose:** Real on-chain verification via Ponder indexer for production use on Base mainnet. Provides independent blockchain event source for verification and reconciliation.

**Related Documentation:**

- [PAYMENTS_DESIGN.md](PAYMENTS_DESIGN.md) - MVP payment system with stub verification
- [PAYMENTS_TEST_DESIGN.md](PAYMENTS_TEST_DESIGN.md) - Testing strategy across phases
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md) - Credit accounting system
- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal architecture patterns

---

## Implementation Checklist

### Phase 3: Real Ponder Verification (Post-MVP)

**Objective:** Wire real Ponder queries into PonderOnChainVerifierAdapter. Switch from stub to real blockchain verification.

**Ponder Indexer Setup:**

- [ ] Create `platform/ponder/` directory structure
- [ ] Create `platform/ponder/ponder.config.ts` - Ponder configuration
- [ ] Configure RPC endpoints (Base mainnet + Sepolia)
- [ ] Add USDC contract addresses for both chains
- [ ] Define Transfer event ABI and indexing logic
- [ ] Implement filter for DAO wallet address
- [ ] Set minimum confirmation count (5 blocks per PAYMENTS_DESIGN.md)
- [ ] Create `onchain_transfers` table schema in Ponder
- [ ] Add GraphQL schema for querying transfers
- [ ] Test indexing on Base Sepolia testnet

**Adapter Implementation:**

- [ ] Update `adapters/server/payments/ponder-onchain-verifier.adapter.ts`
- [ ] Create Ponder GraphQL client adapter
- [ ] Implement real `verify()` logic:
  - Query Ponder for Transfer event matching txHash
  - Validate sender matches attempt.from_address
  - Validate recipient matches DAO wallet
  - Validate token matches USDC address
  - Validate amount >= attempt.amountRaw
  - Check confirmations >= MIN_CONFIRMATIONS (5)
- [ ] Handle verification statuses:
  - Not indexed → return PENDING (stay PENDING_UNVERIFIED)
  - Found + valid → return VERIFIED (proceed to settlement)
  - Found + invalid → return FAILED with specific errorCode
- [ ] Add error handling for RPC failures, reorgs

**Configuration Updates:**

- [ ] Update `.cogni/repo-spec.yaml` chain_id to Base mainnet (8453)
- [ ] Add Ponder service to `docker-compose.yml`
- [ ] Add RPC endpoint URLs to `.env.example`
- [ ] Add Ponder database connection string

**Testing:**

- [ ] Unit tests for PonderOnChainVerifierAdapter with mocked Ponder responses
- [ ] Integration tests with real Ponder instance on Sepolia
- [ ] Verify all 9 MVP scenarios work with real verification

---

### Phase 4: Reconciliation & Hardening (Post-MVP)

**Objective:** Independent audit trail comparing payment_attempts vs on-chain transfers.

**Reconciliation Service:**

- [ ] Create `features/payments/services/reconciliation.ts`
- [ ] Implement Ponder GraphQL client for querying transfers
- [ ] Query logic:
  - Fetch CREDITED payment_attempts in time window
  - Fetch Ponder-indexed transfers in same window
  - Match by composite reference (chainId:txHash)
- [ ] Discrepancy detection:
  - Transfer found, no payment_attempt → missed credit opportunity
  - Payment_attempt CREDITED, no transfer → potential fraud
  - Amount mismatch → data integrity issue
- [ ] Generate discrepancy reports (structured JSON logs)
- [ ] Alert integration (Slack/email for ops team)

**Background Jobs:**

- [ ] Add reconciliation job to background worker (BullMQ or cron)
- [ ] Schedule to run every 6-12 hours
- [ ] Add job monitoring (last run timestamp, success/failure tracking)

**Monitoring & Alerts:**

- [ ] Add Prometheus metrics:
  - `ponder_transfers_indexed_total{chain, token}`
  - `ponder_reconciliation_discrepancies{type}`
  - `ponder_reconciliation_last_run_timestamp`
  - `ponder_indexer_lag_blocks{chain}`
- [ ] Create Grafana dashboard for Ponder metrics
- [ ] Set up alerts:
  - Ponder indexer stopped or lagging > 100 blocks
  - Reconciliation discrepancies exceed threshold
  - Reconciliation job hasn't run in expected interval

**Runbooks:**

- [ ] Create `platform/runbooks/PONDER_RECONCILIATION.md`
  - Interpreting discrepancy reports
  - Manual verification process (block explorer)
  - Manually crediting missing payments
  - Investigating suspected fraud
- [ ] Create `platform/runbooks/PONDER_OPERATIONS.md`
  - Restarting Ponder service
  - Re-indexing from specific block
  - Database backup and recovery
  - RPC endpoint failover

**Cleanup:**

- [ ] Clear stuck PENDING_UNVERIFIED attempts after verification timeout
- [ ] Archive old payment_events (retention policy)

---

## Technical Specification

### Ponder Indexing Scope

**What to Index:**

- ERC20 Transfer events for USDC on Base mainnet (8453) and Sepolia (84532)
- Filter: `to` address matches DAO wallet from repo-spec.yaml
- Extract fields: tx_hash, chain_id, from, to, token_contract, amount_raw, block_number, timestamp, confirmations

**Ponder Schema (managed by Ponder):**

Table: `onchain_transfers`

Columns:

- `id` - Ponder-generated ID
- `tx_hash` - Transaction hash (unique per chain)
- `chain_id` - Chain identifier (8453 or 84532)
- `from_address` - Sender wallet (checksummed)
- `to_address` - DAO wallet (checksummed)
- `token_contract` - USDC contract address
- `amount_raw` - Raw token amount (bigint, 6 decimals)
- `block_number` - Block height
- `timestamp` - Block timestamp
- `confirmations` - Current confirmation count
- `status` - 'pending' | 'confirmed'

**Indexes:**

- Unique: (chain_id, tx_hash)
- Query: (to_address, timestamp)
- Query: (status, timestamp)

---

**Phase 3 - PonderOnChainVerifierAdapter Behavior:**

Queries Ponder for indexed Transfer event by (chainId, txHash):

- Transfer not indexed → return PENDING status
- Confirmations < MIN_CONFIRMATIONS (5) → return PENDING
- Invalid recipient/token/amount → return FAILED with specific errorCode
- All valid → return VERIFIED with actual transaction data

Feature service compares `result.actualFrom` with `attempt.fromAddress` for SENDER_MISMATCH detection.

**Phase 4 - Reconciliation Service:**

Compares CREDITED payment_attempts vs Ponder-indexed transfers by composite reference (chainId:txHash). Detects discrepancies and generates reports.

---

## Migration from Stub to Real Verification

**Current MVP (Ethereum Sepolia with Stub):**

- PonderOnChainVerifierAdapter always returns VERIFIED
- No Ponder deployment required
- Fast development iteration

**Phase 3 Cutover (Base Mainnet with Real Ponder):**

1. Deploy Ponder indexer on Base mainnet
2. Verify indexing works correctly
3. Update PonderOnChainVerifierAdapter to use real queries (remove stub)
4. Update repo-spec.yaml chain_id: 11155111 → 8453
5. Deploy backend changes
6. Monitor verification success rate
7. If issues detected, can rollback to Sepolia + stub

**Rollback Plan:**

- Keep stub verification code path as fallback
- Feature flag: `ENABLE_REAL_PONDER_VERIFICATION`
- Can switch back to stub if Ponder indexer fails

---

## Security Model

**MVP (Stub Verification):**

- Trust boundary: SIWE session + backend state machine
- OnChainVerifier always approves (stub)
- TxHash captured but not verified
- Relies on: session ownership enforcement, database constraints, manual monitoring

**Phase 3 (Real Verification):**

- Independent verification: Ponder indexes blockchain independently
- Sender validation: from_address must match session wallet
- Amount validation: transfer amount must meet or exceed expected
- Token/recipient validation: must match USDC and DAO wallet
- Confirmation depth: minimum 5 blocks before approval

**Phase 4 (Reconciliation):**

- Defense in depth: periodic comparison of payment_attempts vs blockchain
- Fraud detection: identifies credits without matching transfers
- Audit trail: payment_events provides full history
- Manual review: discrepancies flagged for ops team investigation

**Threat Model:**

- **MVP:** Malicious user could submit invalid txHash (mitigated by ownership + eventual reconciliation)
- **Phase 3:** Invalid txHash rejected immediately (real verification)
- **Phase 4:** Reconciliation detects any slipped fraud after the fact

---

## Testing Strategy

### Phase 3 Tests (Ponder Integration):

**Unit Tests:**

- [ ] PonderOnChainVerifierAdapter with mocked Ponder GraphQL responses
- [ ] Verification logic for all error codes (SENDER_MISMATCH, INVALID_TOKEN, etc.)
- [ ] Confirmation counting logic
- [ ] RPC error handling

**Integration Tests:**

- [ ] Real Ponder instance on Sepolia testnet
- [ ] Index test USDC transfer, verify query returns correct data
- [ ] Test OnChainVerifier.verify() with real Ponder backend
- [ ] Verify adapter handles "not yet indexed" (PENDING status)

**Stack Tests:**

- [ ] Deploy full stack with Ponder service
- [ ] Execute payment flow end-to-end with real verification
- [ ] Verify all 9 MVP scenarios work with Ponder-backed verification

### Phase 4 Tests (Reconciliation):

**Unit Tests:**

- [ ] Reconciliation service logic with mocked Ponder data
- [ ] Discrepancy detection algorithm (missing credits, missing transfers, amount mismatches)
- [ ] Report generation format

**Integration Tests:**

- [ ] Reconciliation job with real Ponder and database
- [ ] Seed synthetic discrepancies, verify detection
- [ ] Test background job scheduler

---

## Operational Procedures

### Monitoring Checklist

- [ ] Prometheus metrics exported
- [ ] Grafana dashboard deployed
- [ ] Alerts configured in alertmanager
- [ ] On-call runbook procedures documented

### Deployment Checklist

**Phase 3A: Ponder Setup**

- [ ] Deploy Ponder service to staging
- [ ] Configure indexing for Base Sepolia
- [ ] Verify transfers indexed correctly
- [ ] Test GraphQL queries
- [ ] Validate stability before production

**Phase 3B: Production Cutover**

- [ ] Deploy Ponder to production
- [ ] Configure Base mainnet indexing
- [ ] Update PonderOnChainVerifierAdapter (remove stub)
- [ ] Update repo-spec.yaml to Base mainnet
- [ ] Deploy backend with real verification
- [ ] Monitor verification success rate closely
- [ ] Verify no payment failures due to indexer lag

**Phase 4: Reconciliation Deployment**

- [ ] Deploy reconciliation service
- [ ] Enable background job scheduler
- [ ] Test with synthetic discrepancies in staging
- [ ] Deploy to production
- [ ] Monitor and tune alert thresholds

---

## Technical Details

### Ponder Configuration

**File Structure:**

```
platform/ponder/
├── ponder.config.ts       # Main configuration
├── src/
│   └── index.ts          # Event handlers
├── abis/
│   └── usdc.json         # USDC ERC20 ABI
└── schema.graphql        # GraphQL schema
```

**Environment Variables:**

```bash
# RPC Endpoints
PONDER_RPC_BASE_MAINNET=https://mainnet.base.org
PONDER_RPC_BASE_SEPOLIA=https://sepolia.base.org

# DAO Wallet (from repo-spec.yaml)
DAO_WALLET_ADDRESS=0x... # From repoSpec.server.ts

# Ponder Database
PONDER_DATABASE_URL=postgresql://user:pass@ponder-db:5432/ponder
```

**Indexed Events:**

```solidity
event Transfer(address indexed from, address indexed to, uint256 value)
```

Filter: `to == DAO_WALLET_ADDRESS`

---

### OnChainVerifier Port Implementation

**MVP Behavior (PonderOnChainVerifierAdapter - Stubbed):**

Always returns VERIFIED status with expected values mirrored as actual values. No Ponder queries made.

**Phase 3 Behavior (Real Ponder Queries):**

Queries Ponder for indexed Transfer event, validates all parameters, returns actual transaction data.

**Error Codes Returned:**

- `SENDER_MISMATCH` - from_address doesn't match session wallet
- `INVALID_RECIPIENT` - to_address doesn't match DAO wallet
- `INVALID_TOKEN` - token_contract doesn't match USDC
- `INSUFFICIENT_AMOUNT` - transfer amount less than expected
- `INSUFFICIENT_CONFIRMATIONS` - confirmations < MIN_CONFIRMATIONS (5)
- `TX_REVERTED` - transaction failed on-chain
- `RECEIPT_NOT_FOUND` - transaction not indexed by Ponder

---

### Reconciliation Report Format

**Discrepancy Types:**

1. **CREDITED_NO_TRANSFER** - payment_attempt marked CREDITED but no matching on-chain transfer found
2. **TRANSFER_NO_CREDIT** - on-chain transfer found but no matching payment_attempt or not CREDITED
3. **AMOUNT_MISMATCH** - transfer amount less than credited amount

**Report Structure:**

```json
{
  "reconciliationId": "uuid",
  "startTime": "ISO8601",
  "endTime": "ISO8601",
  "totalAttempts": 150,
  "totalTransfers": 148,
  "discrepancies": [
    {
      "type": "TRANSFER_NO_CREDIT",
      "chainId": 8453,
      "txHash": "0x...",
      "fromAddress": "0x...",
      "amountRaw": "5000000",
      "blockNumber": 12345678,
      "timestamp": "ISO8601",
      "notes": "Transfer found but no matching payment_attempt"
    },
    {
      "type": "CREDITED_NO_TRANSFER",
      "attemptId": "uuid",
      "expectedTxHash": "0x...",
      "amountUsdCents": 500,
      "creditedAt": "ISO8601",
      "notes": "Payment marked CREDITED but transfer not found on-chain"
    }
  ],
  "summary": {
    "totalDiscrepancies": 2,
    "creditedNoTransfer": 1,
    "transferNoCredit": 1,
    "amountMismatch": 0
  }
}
```

---

## Why Ponder Over Alternatives

**vs Custom Indexer:**

- Battle-tested framework for EVM event indexing
- Handles chain reorgs automatically
- Built-in GraphQL API
- Active maintenance and documentation
- Faster to deploy than building custom solution

**vs Direct RPC Queries:**

- Ponder maintains persistent index (faster queries)
- No repeated RPC calls for same data
- Consistent view even during reorgs
- Better performance for reconciliation jobs

**vs Subgraph (The Graph):**

- Ponder simpler to self-host (no graph-node complexity)
- Direct SQL access to indexed data
- Lower operational overhead
- Better for internal-only use cases

---

## Deployment Sequence

### Phase 3A: Ponder Setup

- Deploy Ponder to staging with Base Sepolia
- Index test transfers manually
- Verify GraphQL queries work
- Validate adapter integration in test environment

### Phase 3B: Verification Testing

- Run all 9 MVP test scenarios with real Ponder
- Performance testing (verification latency)
- Load testing (multiple concurrent verifications)
- Edge case testing (reorgs, RPC failures)

### Phase 3C: Production Cutover

- Deploy Ponder to production with Base mainnet
- Update repo-spec.yaml to Base mainnet (8453)
- Update PonderOnChainVerifierAdapter (remove stub)
- Deploy backend changes
- Monitor verification success rate
- Gradual rollout: 10% traffic → 50% → 100%

### Phase 4: Reconciliation Deployment

- Deploy reconciliation service to production
- Run first manual reconciliation
- Review discrepancies with ops team
- Enable automated job (6-12 hour interval)
- Tune alert thresholds based on real data
- Document operational procedures

---

## Success Criteria

**Phase 3:**

- [ ] Ponder indexes transfers on Base mainnet correctly
- [ ] Valid payments verified correctly
- [ ] Invalid payments rejected with correct error codes
- [ ] Verification latency acceptable for UX
- [ ] No false positives/negatives in monitoring period

**Phase 4:**

- [ ] Reconciliation job runs reliably
- [ ] All discrepancies explained (no unexplained fraud)
- [ ] Ops team comfortable with runbook procedures
- [ ] Alert thresholds tuned to minimize noise
- [ ] Operational stability validated

---

## Files Affected

**Ponder Infrastructure:**

- `platform/ponder/ponder.config.ts`
- `platform/ponder/src/index.ts`
- `platform/ponder/schema.graphql`
- `platform/ponder/abis/usdc.json`

**Adapters:**

- `src/adapters/server/payments/ponder-onchain-verifier.adapter.ts` (update from stub)
- `src/adapters/server/ponder/graphql-client.ts` (new)

**Services:**

- `src/features/payments/services/reconciliation.ts` (new)

**Configuration:**

- `.cogni/repo-spec.yaml` (update chain_id in Phase 3)
- `docker-compose.yml` (add Ponder service)
- `.env.example` (add Ponder config)

**Runbooks:**

- `platform/runbooks/PONDER_RECONCILIATION.md` (new)
- `platform/runbooks/PONDER_OPERATIONS.md` (new)

**Tests:**

- `tests/unit/adapters/server/payments/ponder-onchain-verifier.adapter.spec.ts` (update)
- `tests/integration/ponder/graphql-client.spec.ts` (new)
- `tests/integration/payments/reconciliation.spec.ts` (new)

---

## References

- [Ponder Documentation](https://ponder.sh/docs/) - Official docs
- [Ponder Indexing Guide](https://ponder.sh/docs/indexing/design-your-schema) - Schema design
- [Base Network](https://base.org/) - Layer 2 documentation
- [USDC on Base](https://basescan.org/token/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913) - Contract explorer
