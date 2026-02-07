---
id: spec.onchain-readers
type: spec
title: "On-Chain Intelligence: Treasury & Ownership"
status: draft
spec_state: draft
trust: draft
summary: Read-only on-chain data ports for DAO treasury snapshots and token ownership distribution via hexagonal adapters
read_when: Adding on-chain read features, implementing treasury UI, or swapping chain adapters
implements: []
owner: cogni-dev
created: 2026-02-03
verified: null
tags:
  - web3
  - data
---

# On-Chain Intelligence: Treasury & Ownership

## Context

The platform needs to read on-chain data for DAO treasury snapshots and token ownership distribution. This is separate from payment verification (handled by `EvmRpcOnChainVerifierAdapter` in the payment flow). Phase 2 is active: treasury snapshot-on-read for header badge using direct RPC (ETH-only).

## Goal

Define the read-only on-chain data ports, adapter contracts, and UI integration patterns for treasury balance display and token ownership tracking.

## Non-Goals

- Payment verification (handled by EvmRpcOnChainVerifier in payment flow)
- Multi-chain support (future — see [ini.onchain-indexer](../../work/initiatives/ini.onchain-indexer.md))
- Ponder indexer integration (future — see initiative P2)
- Persistent storage of treasury balances (chain is system of record)

## Core Invariants

1. **UI_NEVER_CALLS_RPC**: UI never calls RPC or indexers directly; all reads go through HTTP API endpoints.

2. **NO_CLIENT_POLLING**: UI never uses client-side polling (`refetchInterval`) for treasury badge or on-chain displays.

3. **GRACEFUL_DEGRADATION**: Snapshot refresh is best-effort with strict timeout; on failure, endpoint returns stale data + `staleWarning: true` instead of failing the request.

4. **CHAIN_IS_SYSTEM_OF_RECORD**: We do NOT store treasury balances; chain is the system of record. Phase 2 reads directly from chain via TreasuryReadPort with strict timeout.

5. **CONFIG_FROM_REPO_SPEC**: ChainId and treasuryAddress always flow from `.cogni/repo-spec.yaml` via `getPaymentConfig()` into ports/adapters, never hard-coded in features. Treasury address = `getPaymentConfig().receivingAddress` (DAO wallet receiving payments).

6. **PORTS_ARE_TECH_AGNOSTIC**: Ports (TreasuryReadPort, TokenOwnershipReadPort) are read-only and tech-agnostic. Port interfaces remain stable when swapping adapters (viem → Ponder, EVM → Solana).

7. **EVM_THROUGH_CLIENT**: All EVM adapters MUST use EvmOnchainClient (never call viem/RPC directly).

## Design

### Use Cases

#### 1. Treasury Header Badge (Phase 2 — Active)

**Port:** `TreasuryReadPort.getTreasurySnapshot({ chainId, treasuryAddress, tokenAddresses? })`

**API:** `GET /api/v1/public/treasury/snapshot` (public namespace, no auth required)

- Calls TreasuryReadPort with strict timeout (3-5s)
- On timeout or RPC error, returns 200 with `staleWarning: true`; never exposes raw RPC errors

**Client:** Header calls this endpoint once per page load with long `staleTime`, no `refetchInterval`, no client-side polling

**Implementation (Phase 2):** ETH balance only, using `ViemTreasuryAdapter` → `EvmOnchainClient` with direct chain reads

#### 2. Treasury Dashboard (Future)

**Port:** `TreasuryReadPort` (same interface, richer queries)
**Extension:** Reuses snapshot-on-read pattern, adds historical balance charts and multi-token support

#### 3. CogniCanary Ownership (Future)

**Port:** `TokenOwnershipReadPort.getOwnershipSnapshot({ chainId, tokenAddress, limitTopN? })`

- **Current:** SourceCred grain ledger → ownership distribution (pre-token)
- **Future:** On-chain holder tracking when token launches (via Ponder or similar)

### Ports

#### TreasuryReadPort

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

#### TokenOwnershipReadPort

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

### Adapters & Infra

#### EvmOnchainClient (Infra Seam)

Internal infra seam (NOT a domain port) wrapping viem for all EVM RPC operations.

**Interface:** `{ getTransaction, getTransactionReceipt, getBlockNumber, getBalance, getLogs }`

**Implementations:**

- `ViemEvmOnchainClient` (production) - reads RPC URL + chain from repo-spec.yaml
- `FakeEvmOnchainClient` (test) - in-memory, simulates all scenarios without network

**Usage:**

- Payment verification: `EvmRpcOnChainVerifierAdapter` (Phase 1)
- Treasury snapshots: `ViemTreasuryAdapter` (Phase 2)
- Future ownership: adapter TBD when token launches

#### ViemTreasuryAdapter (Phase 2)

Implements `TreasuryReadPort` using `EvmOnchainClient.getBalance()` for ETH and ERC20 `balanceOf` calls for tokens. Validates config from `getPaymentConfig()` before querying chain.

### Phase 2: Treasury Snapshot-on-Read

**Objective:** Display DAO treasury balance in header without client polling or blocking UI on RPC.

**Flow:**

1. Client calls `/api/v1/treasury/snapshot` once per page load
2. Endpoint calls TreasuryReadPort with strict timeout (3-5s)
3. On success: return balance data
4. On timeout/RPC error: return 200 with `staleWarning: true` and null/placeholder balance
5. UI always renders from response and never blocks indefinitely on chain/RPC

**Notes:**

- No persistent storage; chain is the system of record
- Each request may hit RPC; rely on React Query `staleTime` to prevent redundant calls within same session

#### Observability

**Metrics:**

- `treasury_rpc_call_duration_seconds` - latency of TreasuryReadPort calls
- `treasury_rpc_failures_total` - RPC timeout/error counts

**Logs:**

- RPC call attempts with duration
- Timeout/error cases with fallback behavior

**Alerts:**

- RPC failure rate > 20% over 5 minutes

### File Pointers

**Phase 2 Implementation:**

| File                                                   | Purpose                                     |
| ------------------------------------------------------ | ------------------------------------------- |
| `src/ports/treasury-read.port.ts`                      | TreasuryReadPort interface                  |
| `src/adapters/server/onchain/viem-treasury.adapter.ts` | ViemTreasuryAdapter (ETH balance via viem)  |
| `src/app/api/v1/treasury/snapshot/route.ts`            | Public treasury snapshot API endpoint       |
| `src/contracts/treasury.snapshot.v1.contract.ts`       | Zod contract for snapshot response          |
| `src/features/treasury/services/treasuryService.ts`    | TreasuryReadPort orchestration with timeout |
| `src/components/kit/treasury/TreasuryBadge.tsx`        | Treasury balance badge UI component         |
| `src/features/treasury/hooks/useTreasuryBalance.ts`    | React Query hook for treasury balance       |

**Shared Infra:**

| File                                                             | Purpose                                 |
| ---------------------------------------------------------------- | --------------------------------------- |
| `src/shared/web3/onchain/evm-onchain-client.interface.ts`        | EvmOnchainClient interface              |
| `src/adapters/server/onchain/viem-evm-onchain-client.adapter.ts` | Viem implementation of EvmOnchainClient |
| `.cogni/repo-spec.yaml`                                          | Chain config source of truth            |
| `src/shared/config/repoSpec.server.ts`                           | Server-side repo-spec config reader     |

## Acceptance Checks

**Manual:**

1. Verify `GET /api/v1/public/treasury/snapshot` returns balance data with strict timeout
2. Verify timeout/RPC error returns 200 with `staleWarning: true` (not 500)
3. Verify UI calls snapshot API once per page load with no `refetchInterval`
4. Verify all EVM calls go through EvmOnchainClient (no direct viem/RPC imports in features)

## Open Questions

_(none)_

## Related

- [payments-design.md](./payments-design.md) — Payment verification (EvmRpcOnChainVerifier)
- [architecture.md](./architecture.md) — Hexagonal architecture, ports pattern
- [Initiative: On-Chain Indexer](../../work/initiatives/ini.onchain-indexer.md)
