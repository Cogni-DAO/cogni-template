# On-Chain Intelligence: Treasury & Ownership

**Purpose:** Read on-chain data for DAO treasury snapshots and token ownership distribution. No payment verification (handled by EvmRpcOnChainVerifierAdapter in payment flow).

**Status:** Phase 2 active – Treasury snapshot-on-read for header badge using direct RPC (ETH-only).

---

## Invariants

**UI-to-Chain Boundaries:**

- UI never calls RPC or indexers directly; all reads go through HTTP API endpoints
- UI never uses client-side polling (`refetchInterval`) for treasury badge or on-chain displays
- Snapshot refresh is best-effort with strict timeout; on failure, endpoint returns stale data + `staleWarning: true` instead of failing the request

**Data Storage:**

- We do NOT store treasury balances; chain is the system of record
- Phase 2 reads directly from chain via TreasuryReadPort with strict timeout
- Any durable history requirement will be met by an indexer (Ponder) in a later phase

**Configuration:**

- ChainId and treasuryAddress always flow from `.cogni/repo-spec.yaml` via `getPaymentConfig()` into ports/adapters, never hard-coded in features
- Treasury address = `getPaymentConfig().receivingAddress` (DAO wallet receiving payments)

**Port Design:**

- Ports (TreasuryReadPort, TokenOwnershipReadPort) are read-only and tech-agnostic
- Port interfaces remain stable when swapping adapters (viem → Ponder, EVM → Solana)
- All EVM adapters MUST use EvmOnchainClient (never call viem/RPC directly)

---

### Implementation Checklist

- [ ] Define `TreasuryReadPort` (src/ports/treasury-read.port.ts) and `TreasurySnapshot` type
- [ ] Implement `ViemTreasuryAdapter` using `EvmOnchainClient.getBalance` and wire in DI
- [ ] Implement `GET /api/v1/treasury/snapshot` that calls TreasuryReadPort with strict timeout (3-5s)
- [ ] Add Zod contract for API endpoint (`src/contracts/treasury.snapshot.v1.contract.ts`)
- [ ] Add `useTreasuryBalance` hook + `TreasuryBadge` component that calls snapshot API once per page load with no client polling

---

## Use Cases

### 1. Treasury Header Badge (Phase 2 - NOW)

**Port:** `TreasuryReadPort.getTreasurySnapshot({ chainId, treasuryAddress, tokenAddresses? })`

**API:** `GET /api/v1/public/treasury/snapshot` (public namespace, no auth required)

- Calls TreasuryReadPort with strict timeout (3-5s)
- On timeout or RPC error, returns 200 with `staleWarning: true`; never exposes raw RPC errors

**Client:** Header calls this endpoint once per page load with long `staleTime`, no `refetchInterval`, no client-side polling

**Implementation (Phase 2):** ETH balance only, using `ViemTreasuryAdapter` → `EvmOnchainClient` with direct chain reads

### 2. Treasury Dashboard (Future)

**Port:** `TreasuryReadPort` (same interface, richer queries)
**Extension:** Reuses snapshot-on-read pattern, adds historical balance charts and multi-token support

### 3. CogniCanary Ownership (Future)

**Port:** `TokenOwnershipReadPort.getOwnershipSnapshot({ chainId, tokenAddress, limitTopN? })`

- **Current:** SourceCred grain ledger → ownership distribution (pre-token)
- **Future:** On-chain holder tracking when token launches (via Ponder or similar)

---

## File Pointers

**Phase 2 Implementation:**

- **Ports:** `src/ports/treasury-read.port.ts`
- **Adapters:** `src/adapters/server/onchain/viem-treasury.adapter.ts`
- **API:** `src/app/api/v1/treasury/snapshot/route.ts`, `src/contracts/treasury.snapshot.v1.contract.ts`
- **Services:** `src/features/treasury/services/treasuryService.ts` (TreasuryReadPort orchestration with timeout)
- **UI:** `src/components/kit/treasury/TreasuryBadge.tsx`, `src/features/treasury/hooks/useTreasuryBalance.ts`

**Shared Infra:**

- **EvmOnchainClient:** `src/shared/web3/onchain/evm-onchain-client.interface.ts`, `src/adapters/server/onchain/viem-evm-onchain-client.adapter.ts`
- **Config:** `.cogni/repo-spec.yaml`, `src/shared/config/repoSpec.server.ts`

**Future:**

- `src/ports/token-ownership-read.port.ts`
- `src/adapters/server/onchain/sourcecred-ownership.adapter.ts`
- `src/adapters/server/onchain/ponder-treasury.adapter.ts` (if Ponder adopted)

---

## Ports

### TreasuryReadPort

```typescript
interface TreasuryReadPort {
  getTreasurySnapshot(params: {
    chainId: number;
    treasuryAddress: string;
    tokenAddresses?: string[]; // Optional; empty = native token (ETH) only
  }): Promise<TreasurySnapshot>;
}
```

Returns balance snapshot for specified treasury address and tokens. Chain-agnostic interface; adapter handles EVM vs Solana vs other chains.

### TokenOwnershipReadPort

```typescript
interface TokenOwnershipReadPort {
  getOwnershipSnapshot(params: {
    chainId: number;
    tokenAddress: string;
    limitTopN?: number;
  }): Promise<TokenOwnershipSnapshot>;
}
```

Returns token holder distribution. Phase 2: SourceCred adapter. Future: on-chain indexer adapter when token launches.

---

## Adapters & Infra

### EvmOnchainClient (Infra Seam)

Internal infra seam (NOT a domain port) wrapping viem for all EVM RPC operations.

**Interface:** `{ getTransaction, getTransactionReceipt, getBlockNumber, getBalance, getLogs }`

**Implementations:**

- `ViemEvmOnchainClient` (production) - reads RPC URL + chain from repo-spec.yaml
- `FakeEvmOnchainClient` (test) - in-memory, simulates all scenarios without network

**Usage:**

- Payment verification: `EvmRpcOnChainVerifierAdapter` (Phase 1)
- Treasury snapshots: `ViemTreasuryAdapter` (Phase 2)
- Future ownership: adapter TBD when token launches

### ViemTreasuryAdapter (Phase 2)

Implements `TreasuryReadPort` using `EvmOnchainClient.getBalance()` for ETH and ERC20 `balanceOf` calls for tokens. Validates config from `getPaymentConfig()` before querying chain.

---

## Phase 2: Treasury Snapshot-on-Read

**Objective:** Display DAO treasury balance in header without client polling or blocking UI on RPC.

### Behavior

**Flow:**

1. Client calls `/api/v1/treasury/snapshot` once per page load
2. Endpoint calls TreasuryReadPort with strict timeout (3-5s)
3. On success: return balance data
4. On timeout/RPC error: return 200 with `staleWarning: true` and null/placeholder balance
5. UI always renders from response and never blocks indefinitely on chain/RPC

**Notes:**

- No persistent storage; chain is the system of record
- Each request may hit RPC; rely on React Query `staleTime` to prevent redundant calls within same session
- Historical analytics will be handled by a dedicated indexer (Ponder) in a later phase

### Observability

**Metrics:**

- `treasury_rpc_call_duration_seconds` - latency of TreasuryReadPort calls
- `treasury_rpc_failures_total` - RPC timeout/error counts

**Logs:**

- RPC call attempts with duration
- Timeout/error cases with fallback behavior

**Alerts:**

- RPC failure rate > 20% over 5 minutes

---

## Future Design

### Multi-Chain (Phase 3)

- Keep ports chain-agnostic (already accept `chainId` parameter)
- Implement adapters per chain: `ViemTreasuryAdapter` (all EVM), `SolanaTreasuryAdapter` (Helius/custom)

### Ownership Tracking (Post-Token Launch)

- Switch `TokenOwnershipReadPort` from SourceCred adapter to on-chain indexer
- Use snapshot-on-read pattern for ownership pie chart (same as treasury badge)
- Consider Ponder for indexing ERC20 Transfer events → holder balances table

### Ponder for Historical Analytics (Optional)

**When to Consider:** Need historical treasury balance charts, transaction-level detail, or high-volume dashboard queries

**Approach:**

- Ponder indexes ERC20 Transfer events to/from DAO wallet → persistent balance history in Ponder's own database
- Swap `ViemTreasuryAdapter` for `PonderTreasuryAdapter`; port interface unchanged
- Pattern unchanged; Ponder becomes the data source

**Trade-offs:**

- **Pro:** Persistent index, no repeated RPC calls, handles reorgs automatically
- **Con:** Operational complexity (indexer process, GraphQL endpoint, separate postgres instance)
- **Decision:** Phase 2 direct RPC pattern sufficient for header badge; defer until historical analytics needed

---

**Related Docs:**

- [PAYMENTS_DESIGN.md](PAYMENTS_DESIGN.md) - Payment verification (EvmRpcOnChainVerifier)
- [ARCHITECTURE.md](ARCHITECTURE.md) - Hexagonal architecture, ports pattern
