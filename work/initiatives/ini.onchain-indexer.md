---
work_item_id: ini.onchain-indexer
work_item_type: initiative
title: On-Chain Indexer & Treasury Evolution
state: Paused
priority: 3
estimate: 5
summary: Extend treasury reads beyond ETH-only Phase 2 to multi-chain, token ownership tracking, and optional Ponder indexer
outcome: Multi-chain treasury snapshots, on-chain ownership tracking, optional historical analytics via Ponder
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - web3
  - data
---

# On-Chain Indexer & Treasury Evolution

> Source: docs/ONCHAIN_READERS.md

## Goal

Extend the on-chain reading infrastructure beyond the Phase 2 ETH-only treasury snapshot to support multi-chain treasury reads, token ownership tracking (post-token launch), and optional Ponder-based historical analytics.

## Roadmap

### Crawl (P0): Treasury Read Implementation

**Goal:** Wire up the Phase 2 treasury snapshot-on-read pipeline.

| Deliverable                                                                                                          | Status      | Est | Work Item |
| -------------------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Define `TreasuryReadPort` (`src/ports/treasury-read.port.ts`) and `TreasurySnapshot` type                            | Not Started | 1   | —         |
| Implement `ViemTreasuryAdapter` using `EvmOnchainClient.getBalance` and wire in DI                                   | Not Started | 1   | —         |
| Implement `GET /api/v1/treasury/snapshot` that calls TreasuryReadPort with strict timeout (3-5s)                     | Not Started | 1   | —         |
| Add Zod contract for API endpoint (`src/contracts/treasury.snapshot.v1.contract.ts`)                                 | Not Started | 1   | —         |
| Add `useTreasuryBalance` hook + `TreasuryBadge` component that calls snapshot API once per page load with no polling | Not Started | 1   | —         |

### Walk (P1): Multi-Chain & Token Ownership

**Goal:** Support non-EVM chains and token holder distribution.

| Deliverable                                                                                            | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------------------ | ----------- | --- | --------- |
| Implement adapters per chain: `ViemTreasuryAdapter` (all EVM), `SolanaTreasuryAdapter` (Helius/custom) | Not Started | 2   | —         |
| Switch `TokenOwnershipReadPort` from SourceCred adapter to on-chain indexer                            | Not Started | 2   | —         |
| Use snapshot-on-read pattern for ownership pie chart (same as treasury badge)                          | Not Started | 1   | —         |
| Consider Ponder for indexing ERC20 Transfer events → holder balances table                             | Not Started | 1   | —         |

### Run (P2): Ponder Historical Analytics (Optional)

**Goal:** Persistent index for historical treasury balance charts and transaction-level detail.

**When to Consider:** Need historical treasury balance charts, transaction-level detail, or high-volume dashboard queries.

| Deliverable                                                                          | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------ | ----------- | --- | --------- |
| Ponder indexes ERC20 Transfer events to/from DAO wallet → persistent balance history | Not Started | 3   | —         |
| Swap `ViemTreasuryAdapter` for `PonderTreasuryAdapter`; port interface unchanged     | Not Started | 1   | —         |

**Trade-offs:**

- **Pro:** Persistent index, no repeated RPC calls, handles reorgs automatically
- **Con:** Operational complexity (indexer process, GraphQL endpoint, separate postgres instance)
- **Decision:** Phase 2 direct RPC pattern sufficient for header badge; defer until historical analytics needed

#### Future File Pointers

| File                                                          | Purpose                                   |
| ------------------------------------------------------------- | ----------------------------------------- |
| `src/ports/token-ownership-read.port.ts`                      | Token ownership read port                 |
| `src/adapters/server/onchain/sourcecred-ownership.adapter.ts` | SourceCred-based ownership adapter        |
| `src/adapters/server/onchain/ponder-treasury.adapter.ts`      | Ponder-based treasury adapter (if needed) |

## Constraints

- Ports (TreasuryReadPort, TokenOwnershipReadPort) are read-only and tech-agnostic
- Port interfaces remain stable when swapping adapters (viem → Ponder, EVM → Solana)
- No persistent storage in Phase 2; chain is system of record
- Multi-chain: ports already accept `chainId` parameter

## Dependencies

- [ ] EvmOnchainClient infrastructure (existing)
- [ ] Token launch (for ownership tracking)
- [ ] Ponder evaluation (for P2 historical analytics)

## As-Built Specs

- [onchain-readers.md](../../docs/spec/onchain-readers.md) — Treasury & ownership read ports, invariants, Phase 2 design

## Design Notes

_(none yet)_
