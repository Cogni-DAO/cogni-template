# Payments On-Chain Verification (Ponder Integration)

**Status:** Post-MVP hardening. Not required for initial launch.

**Purpose:** Introduce a Ponder-based on-chain indexer that provides an independent view of USDC transfers into the DAO wallet for reconciliation, observability, and future fraud prevention. This does NOT replace the Resmic confirm endpoint in MVP; it adds a second layer of truth.

**Related:**

- MVP payments flow: [RESMIC_PAYMENTS.md](RESMIC_PAYMENTS.md)
- Billing layer: [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md)
- Auth model: [SECURITY_AUTH_SPEC.md](SECURITY_AUTH_SPEC.md)

---

## One Sentence Summary

Ponder watches Base/Base Sepolia for USDC transfers into our DAO wallet, indexes them in a separate database, and exposes them via GraphQL/SQL for reconciliation jobs that compare on-chain transfers to our internal `credit_ledger`.

---

## MVP vs v2 Security Model

**MVP (Resmic Confirm Only):**

- Trust boundary: SIWE session + `/api/v1/payments/resmic/confirm` endpoint
- Credits granted based on Resmic payment status callback in browser
- No on-chain verification in critical path
- No tx hash captured or verified

**v2 (Ponder Reconciliation, Phase 1):**

- Ponder indexes on-chain transfers as independent data source
- Periodic reconciliation job compares Ponder data vs `credit_ledger`
- Discrepancies flagged for manual review (no automatic blocking)
- Observability and fraud detection, not a hard gate

**v2 (Ponder as Gate, Phase 2 - Future):**

- For large payments or high-risk accounts, require matching on-chain transfer before marking credits as settled
- Requires capturing tx hash on frontend (Resmic SDK doesn't expose this; may need client-side wallet integration)
- Hard gate for high-value transactions

---

## Runtime Topology

**Service Architecture:**

- Ponder runs as a separate Docker service in the same network as the app and LiteLLM
- Connects to Base/Base Sepolia RPC endpoints (via Alchemy/Infura or self-hosted node)
- Maintains its own Postgres database (Ponder-managed schema, separate from app DB)
- Exposes GraphQL and HTTP endpoints for querying indexed data
- No public exposure; used only by backend reconciliation jobs or ops tooling

**Environment Configuration:**

- [ ] Add Ponder service to `docker-compose.yml` (dev/test/prod stacks)
- [ ] Add RPC endpoint URLs to `.env.example`:
  - `PONDER_RPC_BASE_MAINNET` - Base mainnet RPC
  - `PONDER_RPC_BASE_SEPOLIA` - Base Sepolia testnet RPC
- [ ] Add DAO wallet addresses (already in env from Resmic integration):
  - `DAO_WALLET_ADDRESS_BASE`
  - `DAO_WALLET_ADDRESS_BASE_SEPOLIA`
- [ ] Add Ponder database connection string:
  - `PONDER_DATABASE_URL` - Separate Postgres for Ponder schema

**Files:**

- `docker-compose.yml` - Add Ponder service
- `.env.example` - RPC endpoints and configuration
- `platform/ponder/` - Ponder configuration and indexing logic (new directory)

---

## Indexing Specification

**What to Index:**

- ERC20 Transfer events for USDC on Base and Base Sepolia
- Filter: `to` address matches DAO wallet address
- Extract: `tx_hash`, `chain_id`, `from`, `to`, `token_contract`, `amount_raw`, `block_number`, `timestamp`

**Confirmation Requirements:**

- Minimum confirmations before marking transfer as "confirmed": 5–10 blocks (configurable)
- Store `confirmations` count in indexed data
- Only expose "confirmed" transfers to reconciliation jobs

**Database Schema (Ponder-managed):**

- Table: `onchain_payments`
- Columns:
  - `id` - Ponder-generated ID
  - `tx_hash` - Ethereum transaction hash (unique per chain)
  - `chain_id` - Chain identifier (8453 = Base, 84532 = Base Sepolia)
  - `from_address` - Sender wallet
  - `to_address` - DAO wallet (should always match our address)
  - `token_contract` - USDC contract address
  - `amount_raw` - Raw token amount (USDC has 6 decimals)
  - `amount_usd` - USD equivalent (amount_raw / 1e6 for USDC)
  - `block_number` - Block height
  - `timestamp` - Block timestamp
  - `confirmations` - Current confirmation count
  - `status` - 'pending' | 'confirmed'

**Implementation Checklist:**

- [ ] Create `platform/ponder/ponder.config.ts` - Ponder configuration file
- [ ] Configure RPC endpoints for Base mainnet and Base Sepolia
- [ ] Add USDC contract addresses for both chains
- [ ] Define Transfer event ABI and indexing logic
- [ ] Implement filter for DAO wallet address
- [ ] Set minimum confirmation count (5–10 blocks)
- [ ] Create `onchain_payments` table schema in Ponder
- [ ] Add GraphQL schema for querying transfers
- [ ] Test indexing on Base Sepolia testnet

**Files:**

- `platform/ponder/ponder.config.ts` - Main Ponder config
- `platform/ponder/src/index.ts` - Indexing event handlers
- `platform/ponder/schema.graphql` - GraphQL schema for queries
- `platform/ponder/abis/usdc.json` - USDC ERC20 ABI

**Reference:** [Ponder Documentation](https://ponder.sh/docs/) - Accounts & Transfers indexing

---

## Integration with Cogni Billing

### Phase 1: Reconciliation Only (Post-MVP)

**Goal:** Compare on-chain transfers to `credit_ledger` entries for observability and fraud detection.

**Behavior:**

- Periodic reconciliation job (cron or background worker) runs every N hours
- Query Ponder GraphQL endpoint for all confirmed transfers in the last period
- Query app database for `credit_ledger` rows where `reason IN ('resmic_payment', 'onchain_deposit')` in same period
- Compare totals:
  - Sum of on-chain `amount_usd` from Ponder
  - Sum of credited amounts from `credit_ledger` (convert credits to USD: credits / 1000)
- Flag discrepancies:
  - On-chain > Credited: potential missed credits (user paid but wasn't credited)
  - Credited > On-chain: potential fraud (user credited without payment)
- Log discrepancies and surface to ops dashboard or Slack alerts
- **No automatic blocking** - manual review required

**Implementation Checklist:**

- [ ] Create reconciliation service: `src/features/payments/services/ponder-reconciliation.ts`
- [ ] Implement Ponder GraphQL client for querying `onchain_payments`
- [ ] Add reconciliation job to background worker (BullMQ or similar)
- [ ] Schedule job to run every 6–12 hours
- [ ] Implement comparison logic:
  - [ ] Query Ponder for confirmed transfers in time window
  - [ ] Query `credit_ledger` for matching period
  - [ ] Compare totals and individual transactions
  - [ ] Generate discrepancy report
- [ ] Add logging for all discrepancies (structured JSON logs)
- [ ] Create ops dashboard or alert integration (Slack/email)
- [ ] Add metrics: `ponder_reconciliation_discrepancies_total`, `ponder_reconciliation_last_run_timestamp`

**Files:**

- `src/features/payments/services/ponder-reconciliation.ts` - Reconciliation service
- `src/adapters/server/ponder/graphql-client.ts` - Ponder GraphQL client
- `src/workers/reconciliation-job.ts` - Background job scheduler
- `tests/unit/features/payments/services/ponder-reconciliation.test.ts` - Unit tests
- `tests/integration/ponder/reconciliation.int.test.ts` - Integration tests with Ponder

---

### Phase 2: Stronger Guarantees (Future)

**Goal:** For high-value or high-risk payments, require on-chain confirmation before marking credits as fully settled.

**Prerequisites:**

- Capture transaction hash on frontend (requires changes to Resmic integration or direct wallet interaction)
- Store `tx_hash` in `credit_ledger.reference` field or new `credit_ledger.tx_hash` column
- Define thresholds for "high-value" (e.g., > $100 USD) or "high-risk" accounts

**Behavior:**

- When user calls `/api/v1/payments/resmic/confirm`, if payment exceeds threshold:
  - Insert `credit_ledger` row with `status='pending'`
  - Do NOT update `billing_accounts.balance_credits` yet
  - Return response indicating payment is pending verification
- Background job periodically checks Ponder for matching tx_hash:
  - If found and confirmed: update `credit_ledger` status to 'confirmed', credit balance
  - If not found after timeout (e.g., 1 hour): flag for manual review
- For payments below threshold, continue with instant crediting (Phase 1 behavior)

**Implementation Checklist:**

- [ ] Add `tx_hash` field to `/payments/resmic/confirm` request schema (optional)
- [ ] Add `status` column to `credit_ledger` ('pending' | 'confirmed')
- [ ] Implement threshold logic in confirm endpoint
- [ ] Create verification job that queries Ponder by tx_hash
- [ ] Add user-facing "pending" state in UI for unconfirmed credits
- [ ] Define timeout and manual review process

**Files:**

- `src/contracts/payments.resmic.confirm.v1.contract.ts` - Add optional `tx_hash` field
- `src/shared/db/migrations/*_add_credit_ledger_status.sql` - Add status column
- `src/features/payments/services/resmic-confirm.ts` - Threshold logic
- `src/workers/ponder-verification-job.ts` - Verification worker
- `tests/unit/features/payments/services/resmic-confirm.test.ts` - Test pending flow

**Note:** Phase 2 requires frontend changes to capture tx_hash. Resmic SDK does not expose this; may need to fork Resmic or use direct wallet interaction (ethers.js/viem) alongside Resmic UI.

---

## Security Model

**Layered Defense:**

1. **Layer 1 (MVP):** SIWE session + Resmic confirm endpoint
   - Primary gate: authenticated session resolves billing_account_id
   - Trust assumption: Resmic payment status callback reflects real payment
   - Mitigation: Rate limiting, idempotency, manual monitoring

2. **Layer 2 (Phase 1):** Ponder reconciliation
   - Independent view: on-chain data source separate from frontend
   - Observability: flag discrepancies between claimed credits and on-chain transfers
   - Detection: identify potential fraud patterns over time
   - No blocking: manual review required

3. **Layer 3 (Phase 2):** Ponder as gate
   - Hard requirement: large/risky payments must have matching on-chain tx
   - Fraud prevention: cannot credit without proof of on-chain transfer
   - Trade-off: slower UX (pending state until confirmed)

**Threat Model:**

- **MVP:** Malicious user could call `/confirm` without paying (mitigated by SIWE auth, rate limits, reconciliation)
- **Phase 1:** Reconciliation detects fraud after the fact, requires manual intervention
- **Phase 2:** On-chain gate prevents fraud in real-time for high-value transactions

**Access Control:**

- Ponder GraphQL/HTTP endpoints are internal-only (not exposed to public)
- App backend queries Ponder via private network or localhost
- All writes to `credit_ledger` still go through app business logic (Ponder is read-only data source)

---

## Testing Strategy

### Unit Tests

- [ ] Ponder reconciliation service logic (mock Ponder responses)
- [ ] Discrepancy detection algorithm
- [ ] Threshold logic for Phase 2 pending credits

### Integration Tests

- [ ] Query Ponder GraphQL endpoint in test environment
- [ ] Insert test data in Ponder DB, verify query results
- [ ] Test reconciliation job end-to-end with real Ponder instance

### Stack Tests

- [ ] Deploy Ponder service in Docker test stack
- [ ] Index test USDC transfers on Base Sepolia
- [ ] Verify reconciliation job detects discrepancies
- [ ] Test pending credit flow (Phase 2)

### Manual Testing

- [ ] Run Ponder indexer on Base Sepolia
- [ ] Send test USDC transfer to DAO wallet
- [ ] Verify transfer appears in `onchain_payments` after confirmations
- [ ] Trigger reconciliation job and verify output
- [ ] Test GraphQL queries via Ponder GraphiQL interface

**Files:**

- `tests/unit/features/payments/services/ponder-reconciliation.test.ts`
- `tests/integration/ponder/graphql-client.int.test.ts`
- `tests/stack/ponder/reconciliation.stack.test.ts`

---

## Operational Procedures

### Monitoring

- [ ] Add Prometheus metrics:
  - `ponder_transfers_indexed_total{chain, token}` - Total transfers indexed
  - `ponder_reconciliation_discrepancies{type}` - Discrepancies by type (missing credits, excess credits)
  - `ponder_reconciliation_last_run_timestamp` - Last successful reconciliation
  - `ponder_indexer_lag_blocks{chain}` - Indexer lag behind chain tip
- [ ] Add Grafana dashboard for Ponder metrics
- [ ] Set up alerts:
  - Ponder indexer stopped or lagging > 100 blocks
  - Reconciliation discrepancies exceed threshold
  - Reconciliation job hasn't run in > 24 hours

### Runbooks

- [ ] Create `platform/runbooks/PONDER_RECONCILIATION.md`
  - How to interpret discrepancy reports
  - Manual verification process (check block explorer)
  - How to manually credit missing payments
  - How to investigate suspected fraud

- [ ] Create `platform/runbooks/PONDER_OPERATIONS.md`
  - How to restart Ponder service
  - How to re-index from specific block
  - Database backup and recovery
  - RPC endpoint failover

**Files:**

- `platform/runbooks/PONDER_RECONCILIATION.md`
- `platform/runbooks/PONDER_OPERATIONS.md`
- `platform/monitoring/grafana-dashboards/ponder.json`

---

## Implementation Phases

### Phase 1A: Ponder Setup (Post-MVP)

- [ ] Add Ponder service to Docker compose
- [ ] Configure indexing for Base Sepolia testnet
- [ ] Test indexing with manual USDC transfers
- [ ] Verify GraphQL queries work

### Phase 1B: Reconciliation (Post-MVP)

- [ ] Build reconciliation service and GraphQL client
- [ ] Add background job scheduler
- [ ] Deploy to dev environment
- [ ] Test with synthetic discrepancies
- [ ] Add monitoring and alerts

### Phase 1C: Production (Post-MVP)

- [ ] Configure Base mainnet indexing
- [ ] Deploy Ponder to production infrastructure
- [ ] Enable reconciliation job in production
- [ ] Monitor for 2–4 weeks, tune thresholds

### Phase 2: On-Chain Gate (Future)

- [ ] Capture tx_hash on frontend
- [ ] Add pending credit state to backend
- [ ] Implement verification worker
- [ ] Test with high-value test transactions
- [ ] Roll out to high-risk accounts first
- [ ] Expand to all large transactions

---

## Success Criteria

**Phase 1A:**

- [ ] Ponder successfully indexes USDC transfers on Base Sepolia within 30 seconds of confirmation
- [ ] GraphQL queries return accurate transfer data
- [ ] Service runs stably for 7 days with no crashes

**Phase 1B:**

- [ ] Reconciliation job detects 100% of synthetic discrepancies in tests
- [ ] Job runs reliably every 6 hours with < 1% failure rate
- [ ] Discrepancy reports are actionable and accurate

**Phase 1C:**

- [ ] Production reconciliation runs for 30 days with no false positives
- [ ] All real discrepancies are explained (legitimate delays, test transactions, etc.)
- [ ] Ops team comfortable with runbook procedures

**Phase 2:**

- [ ] 100% of high-value transactions verified on-chain before crediting
- [ ] Pending state UX is clear to users
- [ ] Average verification time < 2 minutes for normal network conditions
- [ ] Zero fraudulent high-value credits slip through

---

## Key Design Decisions

**Why Ponder over custom indexer?**

- Battle-tested open-source framework specifically for EVM event indexing
- Handles chain reorgs, RPC failures, and state management automatically
- GraphQL API out of the box
- Active community and documentation
- Faster to deploy than building custom indexer

**Why separate database?**

- Ponder manages its own schema and migrations
- Isolates indexer state from app state
- Easier to wipe and re-index if needed
- Clear separation of concerns

**Why reconciliation before gate?**

- MVP needs fast user experience (instant credits)
- Build confidence in Ponder accuracy before making it a hard requirement
- Allows tuning of thresholds and detection logic with real data
- Gradual rollout reduces risk

**Why not verify every payment on-chain?**

- Resmic SDK doesn't expose tx_hash (would require significant frontend rework)
- Most payments are small; fraud risk is proportional to amount
- On-chain verification adds latency (wait for confirmations)
- Phase 1 catches fraud via reconciliation; Phase 2 prevents it for high-value only

---

## References

- [Ponder Documentation](https://ponder.sh/docs/) - Official Ponder docs
- [Ponder Indexing Guide](https://ponder.sh/docs/indexing/design-your-schema) - Schema and event handlers
- [Base Network](https://base.org/) - Layer 2 network documentation
- [USDC on Base](https://basescan.org/token/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913) - USDC contract on Base mainnet
- [RESMIC_PAYMENTS.md](RESMIC_PAYMENTS.md) - MVP payments flow (Resmic confirm endpoint)
- [BILLING_EVOLUTION.md](BILLING_EVOLUTION.md) - Credit accounting and dual-cost billing
