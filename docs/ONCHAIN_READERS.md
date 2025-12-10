# On-Chain Intelligence: Treasury & Ownership

**Purpose:** Read on-chain data for DAO treasury snapshots and token ownership distribution. No payment verification (handled by EvmRpcOnChainVerifierAdapter in payment flow).

**Status:** Design phase - ports defined, implementation deferred to v2/v3

---

## Use Cases

### 1. Treasury Dashboard

Display DAO multisig balances across chains and tokens.

**Port:** `TreasuryReadPort.getTreasurySnapshot({ chainId, treasuryAddress, tokenAddresses? }): Promise<TreasurySnapshot>`

**Phase 1 (RPC):** Direct balance queries via viem
**Phase 2 (Indexed):** Ponder indexes treasury inflows/outflows for historical charting

### 2. CogniCanary Ownership

Pie chart of token holder distribution.

**Port:** `TokenOwnershipReadPort.getOwnershipSnapshot({ chainId, tokenAddress, limitTopN? }): Promise<TokenOwnershipSnapshot>`

**Phase 1 (Pre-Token):** SourceCred grain ledger → ownership distribution
**Phase 2 (Post-Token):** Ponder indexes ERC20 Transfer events → holder balances table → GraphQL

---

## Architecture

### Phase 1: Direct RPC (Current)

- `TreasuryReadPort` → viem balance queries
- `TokenOwnershipReadPort` → SourceCred grain ledger adapter
- Periodic snapshotter (cron) writes to Postgres for basic historical charting

### Phase 2: Ponder Indexing (Future - When Token Live)

- Ponder project indexes CogniCanary ERC20 Transfer events
- Tables: `holders(address, balance)`, `transfers(from, to, value, timestamp)`
- Server adapter maps dashboard queries → Ponder GraphQL
- `TokenOwnershipReadPort` switches to Ponder backend

### Phase 3: Multi-Chain (Future)

- Keep ports chain-agnostic
- Implement `EvmOnchainReadAdapter` (Ponder) + `SolanaOnchainReadAdapter` (Helius/custom)

---

## Shared EVM Infrastructure

**EvmOnchainClient:** Internal infra seam (NOT a domain port) wrapping viem for all EVM RPC operations.

**Interface:** `{ getTransaction, getTransactionReceipt, getBlockNumber }`

**Implementations:**

- `ViemEvmOnchainClient` (production) - reads RPC URL + chain from repo-spec.yaml
- `FakeEvmOnchainClient` (test) - in-memory, simulates all tx/receipt/log scenarios without network

**Usage:** All EVM on-chain adapters depend on EvmOnchainClient:

- **Payment verification:** `EvmRpcOnChainVerifierAdapter` (behavior governed by [PAYMENTS_DESIGN.md](PAYMENTS_DESIGN.md))
- **Treasury snapshots:** `ViemTreasuryAdapter` (Phase 1)
- **Token ownership:** `PonderOwnershipAdapter` (Phase 2)

**Config source:** `.cogni/repo-spec.yaml` provides chain_id and RPC URL; validated at construction

**Multi-chain:** Solana will have separate `SolanaOnchainClient` interface (no forced EVM/Solana unification)

**File pointers:**

- `adapters/server/onchain/evm-onchain-client.interface.ts` (future)
- `adapters/server/onchain/viem-evm-onchain-client.adapter.ts` (future)
- `adapters/test/onchain/fake-evm-onchain-client.adapter.ts` (future)

---

## Invariants

**Domain Ports:**

- **Ports are read-only:** No state mutations, no write operations
- **Chain-agnostic interfaces:** Ports accept `chainId` parameter
- **Adapter selection by chain:** EVM → Ponder/viem, Solana → Helius/custom
- **Treasury config from repo-spec:** `.cogni/repo-spec.yaml` defines treasury addresses
- **No payment logic:** Payment verification lives in `EvmRpcOnChainVerifierAdapter` (see PAYMENTS_DESIGN.md)

**EvmOnchainClient (Infra Seam):**

- **All EVM adapters MUST use EvmOnchainClient:** Payment verifier, treasury, ownership adapters never call viem/RPC directly
- **Test isolation:** Unit tests MUST use FakeEvmOnchainClient (no RPC calls in unit tests)
- **Config validation:** ViemEvmOnchainClient validates repo-spec config at construction
- **Prod/test separation:** FakeEvmOnchainClient NEVER used in production/preview/dev

---

## File Pointers

**Ports:**

- `src/ports/treasury-read.port.ts` (future)
- `src/ports/token-ownership-read.port.ts` (future)

**Adapters (Phase 1):**

- `src/adapters/server/onchain/viem-treasury.adapter.ts` (future)
- `src/adapters/server/onchain/sourcecred-ownership.adapter.ts` (future)

**Adapters (Phase 2 - Ponder):**

- `platform/ponder/` - Ponder indexer project
- `src/adapters/server/onchain/ponder-graphql-client.ts` (future)
- `src/adapters/server/onchain/ponder-ownership.adapter.ts` (future)

**Config:**

- `.cogni/repo-spec.yaml` - Treasury addresses, token addresses
- `src/shared/config/repoSpec.server.ts` - Config reader

**Related Docs:**

- [PAYMENTS_DESIGN.md](PAYMENTS_DESIGN.md) - Payment verification (EvmRpcOnChainVerifier)
- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal architecture, ports pattern

---

## Why Ponder (Phase 2+)

**vs Direct RPC:**

- Persistent index (faster queries for historical data)
- No repeated RPC calls
- Handles reorgs automatically

**vs The Graph:**

- Simpler self-hosting
- Direct SQL access
- Lower operational overhead

**When to use:**

- Token holder tracking (Transfer event indexing)
- Historical treasury analytics
- High-volume on-chain data queries

**When NOT to use:**

- One-off balance checks (use viem directly)
- Payment verification (use EvmRpcOnChainVerifier)
