# Chain Deployment Verification Refactor

> [!CRITICAL]
> All deployment verification must flow a single `TxEvidence` object through client → API → server, eliminating per-field propagation and making block-aware verification the default.

## Core Invariants

1. **Single Evidence Object**: Receipt data (blockNumber, blockHash, contractAddress, status, logs) flows as one typed object, never as individual fields.

2. **Block-Aware by Default**: All on-chain reads (getBytecode, readContract) use at-or-after `evidence.blockNumber`, with fallback for non-archive providers.

3. **Progressive Abstraction**: Do NOT introduce a generalized plugin framework until 3+ distinct verification types exist.

---

## Implementation Checklist

### Tier 1: TxEvidence Unification (Small)

- [ ] Define `TxEvidence` type in contracts layer
- [ ] Update `FormationState` to use `signalEvidence: TxEvidence | null` instead of `signalBlockNumber`
- [ ] Update `SIGNAL_TX_CONFIRMED` action to accept `TxEvidence`
- [ ] Update `SetupVerifyInput` contract to use `signalEvidence` object
- [ ] Update `verifyFormation()` API client to pass evidence object
- [ ] Update verify route to destructure from evidence object
- [ ] Remove individual `signalBlockNumber` field propagation

#### Chores

- [ ] Update module headers to link this spec
- [ ] Add arch test: "TxEvidence is single source of receipt data"

### Tier 2: Unified Verification Helper (Medium)

- [ ] Create `verifyDeployment(client, evidence, checks)` helper
- [ ] Extract DAO verification to use helper (currently only uses logs)
- [ ] Extract Signal verification to use helper
- [ ] Add `getBytecode` check to DAO verification (parity with Signal)
- [ ] Consolidate error handling patterns

### Tier 3: Generic Plugin State Machine (Large - Future)

- [ ] **Prerequisite**: 3+ distinct verification types exist
- [ ] Define `EffectChecker<T>` plugin interface
- [ ] Create `verifyTxEffects` state machine
- [ ] Migrate DAO + Signal to plugins
- [ ] **Do NOT build this preemptively**

---

## File Pointers (Tier 1 Scope)

| File                                                   | Change                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `src/contracts/setup.verify.v1.contract.ts`            | Define `TxEvidence` schema, use in input                      |
| `src/features/setup/daoFormation/formation.reducer.ts` | Replace `signalBlockNumber` with `signalEvidence: TxEvidence` |
| `src/features/setup/daoFormation/api.ts`               | Accept `TxEvidence` param instead of `signalBlockNumber`      |
| `src/features/setup/hooks/useDAOFormation.ts`          | Build `TxEvidence` from receipt, pass to reducer/API          |
| `src/app/api/setup/verify/route.ts`                    | Destructure from `signalEvidence`, use in verification        |

---

## Schema

### TxEvidence Type

```typescript
// Internal type (matches viem)
interface TxEvidence {
  txHash: HexAddress;
  blockNumber: bigint;
  blockHash: HexAddress;
  status: "success" | "reverted";
  contractAddress?: HexAddress; // Present for deployments
}

// JSON boundary (API contract) - use string for bigint
interface TxEvidenceJson {
  txHash: string;
  blockNumber: string; // Serialized bigint
  blockHash: string;
  status: "success" | "reverted";
  contractAddress?: string;
}
```

**Why:** Single object eliminates N-field propagation. All receipt-derived data travels together. Using `bigint` matches viem types and avoids repeated coercion bugs.

**Block-aware reads:** `evidence.blockNumber` is available for `getBytecode()` and `readContract()` calls. If provider doesn't support historical reads, fallback to blockHash validation or return PENDING status.

---

## Design Decisions

### 1. Why TxEvidence vs Full Receipt

| Field             | Included       | Reason                             |
| ----------------- | -------------- | ---------------------------------- |
| `txHash`          | Yes            | Identifies transaction             |
| `blockNumber`     | Yes            | Required for block-aware reads     |
| `blockHash`       | Yes            | Allows block-specific verification |
| `status`          | Yes            | Fast-fail on reverted tx           |
| `contractAddress` | Yes (optional) | Present for deployments            |
| `logs`            | No (Tier 2)    | Only needed for event extraction   |

**Rule:** Start minimal. Add `logs` in Tier 2 when unifying DAO verification.

---

### 2. Data Flow (Tier 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLIENT: Build TxEvidence from receipt                               │
│ ─────────────────────────────────                                   │
│ 1. useWaitForTransactionReceipt() returns receipt                   │
│ 2. Build TxEvidence { txHash, blockNumber, blockHash, status, ... } │
│ 3. Dispatch SIGNAL_TX_CONFIRMED with evidence                       │
│ 4. Call verifyFormation({ ..., signalEvidence })                    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER: Use at-or-after evidence.blockNumber for reads              │
│ ───────────────────────────                                         │
│ - Try: getBytecode({ address, blockNumber: evidence.blockNumber })  │
│ - Fallback: If provider error, validate via blockHash or PENDING    │
│ - readContract({ ..., blockNumber: evidence.blockNumber })          │
│ - Prefer specific block over "latest" for deployment verification   │
└─────────────────────────────────────────────────────────────────────┘
```

**Why block-aware by default?** Eliminates cross-RPC race conditions where client's RPC has indexed a block but server's RPC hasn't.

**Fallback for non-archive providers:** If historical `getCode` fails, verify block exists via `getBlock(evidence.blockHash)` and retry at "latest" or return `PENDING` with `retryAfterMs`.

---

### 3. Migration Strategy

1. **Tier 1**: Replace `signalBlockNumber: number` with `signalEvidence: TxEvidence` everywhere
2. **Tier 2**: Add helper function, unify DAO + Signal verification patterns
3. **Tier 3**: Only if we add Safe deployment, ENS registration, or similar

**Never** introduce abstraction before concrete use cases justify it.

---

### 4. Error Handling

**Current (bespoke):**

- Each verification step has inline try/catch
- Errors collected in `string[]`

**Future (Tier 2):**

- Helper returns `Result<T, VerificationError>`
- Typed error variants: `NOT_FOUND`, `MISMATCH`, `RPC_ERROR`

---

**Last Updated**: 2025-12-16
**Status**: Design Approved
