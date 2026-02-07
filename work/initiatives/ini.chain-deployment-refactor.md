---
work_item_id: ini.chain-deployment-refactor
work_item_type: initiative
title: Chain Deployment Refactor — Signed Repo-Spec & Attested Builds
state: Paused
priority: 2
estimate: 5
summary: Long-term hardening of the repo-spec governance pipeline — signed configs, hash verification, attested builds, revocation policy
outcome: Production only runs images with DAO-approved, cryptographically signed repo-spec configurations
assignees: derekg1729
created: 2026-02-06
updated: 2026-02-06
labels: [web3, deployment, security]
---

# Chain Deployment Refactor — Signed Repo-Spec & Attested Builds

## Goal

Harden the repo-spec governance pipeline so that production deployments are cryptographically bound to DAO-approved configuration. Today the app validates repo-spec structure and chain alignment at startup; this initiative adds signature verification, hash attestation, and revocation to close the trust gap.

## Roadmap

### Crawl (P0) — Current State

**Goal:** Structural validation and chain alignment (already implemented).

| Deliverable                                            | Status | Est | Work Item |
| ------------------------------------------------------ | ------ | --- | --------- |
| Zod schema validation of repo-spec structure           | Done   | 1   | —         |
| `chainId === CHAIN_ID` alignment check at startup      | Done   | 1   | —         |
| `getPaymentConfig()` returns DAO wallet from repo-spec | Done   | 1   | —         |

### Walk (P1) — Signed Repo-Spec & Hash Verification

**Goal:** Repo-spec is cryptographically signed; production refuses unsigned configs.

| Deliverable                                                                                                                                                                      | Status      | Est | Work Item            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Signed repo-spec: repo-spec itself is signed by a DAO-controlled key; the app refuses to start unless repo-spec is both structurally valid and cryptographically signed          | Not Started | 3   | (create at P1 start) |
| Governance-critical artifact: `.cogni/repo-spec.yaml` is treated like a bootloader config — any change to DAO chain/wallet must go through PR + CI on the main governance branch | Not Started | 2   | (create at P1 start) |
| Repo-spec Revocation Policy: a list of hashes of old vulnerable repo-specs that should not be trusted, regardless of trusted signature                                           | Not Started | 2   | (create at P1 start) |

### Run (P2+) — Attested Builds & Edge Policy

**Goal:** Full supply-chain binding — builds attest repo-spec hash, production enforces approved pairs.

| Deliverable                                                                                                                                                                                                             | Status      | Est | Work Item            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Attested builds: build pipelines compute a hash of repo-spec and record `(git_commit, repo_spec_hash)` in a build attestation; production only runs images with approved `(commit, hash)` pairs                         | Not Started | 3   | (create at P2 start) |
| Policy at the edge: production policy enforces "only run images whose repo-spec hash and signature match the DAO-approved spec for this environment," making Web2 runtime strictly bound to Web3-governed configuration | Not Started | 3   | (create at P2 start) |

### Deployment Verification Track

> Source: `docs/CHAIN_DEPLOYMENT_TECH_DEBT.md`

#### Tier 1: TxEvidence Unification (Small)

**Goal:** All receipt data flows as a single typed `TxEvidence` object. Block-aware reads by default.

| Deliverable                                                         | Status      | Est | Work Item |
| ------------------------------------------------------------------- | ----------- | --- | --------- |
| Define `TxEvidence` type in contracts layer                         | Not Started | 1   | —         |
| Update `FormationState` to use `signalEvidence: TxEvidence \| null` | Not Started | 1   | —         |
| Update `SIGNAL_TX_CONFIRMED` action to accept `TxEvidence`          | Not Started | 1   | —         |
| Update `SetupVerifyInput` contract to use `signalEvidence` object   | Not Started | 1   | —         |
| Update `verifyFormation()` API client to pass evidence object       | Not Started | 1   | —         |
| Update verify route to destructure from evidence object             | Not Started | 1   | —         |
| Remove individual `signalBlockNumber` field propagation             | Not Started | 1   | —         |
| Add arch test: "TxEvidence is single source of receipt data"        | Not Started | 1   | —         |

**File Pointers (Tier 1):**

| File                                                   | Change                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `src/contracts/setup.verify.v1.contract.ts`            | Define `TxEvidence` schema, use in input                      |
| `src/features/setup/daoFormation/formation.reducer.ts` | Replace `signalBlockNumber` with `signalEvidence: TxEvidence` |
| `src/features/setup/daoFormation/api.ts`               | Accept `TxEvidence` param instead of `signalBlockNumber`      |
| `src/features/setup/hooks/useDAOFormation.ts`          | Build `TxEvidence` from receipt, pass to reducer/API          |
| `src/app/api/setup/verify/route.ts`                    | Destructure from `signalEvidence`, use in verification        |

#### Tier 2: Unified Verification Helper (Medium)

**Goal:** Single `verifyDeployment()` helper replaces bespoke per-chain verification.

| Deliverable                                                    | Status      | Est | Work Item |
| -------------------------------------------------------------- | ----------- | --- | --------- |
| Create `verifyDeployment(client, evidence, checks)` helper     | Not Started | 2   | —         |
| Extract DAO verification to use helper (currently only logs)   | Not Started | 1   | —         |
| Extract Signal verification to use helper                      | Not Started | 1   | —         |
| Add `getBytecode` check to DAO verification (parity w/ Signal) | Not Started | 1   | —         |
| Consolidate error handling patterns                            | Not Started | 1   | —         |

#### Tier 3: Generic Plugin State Machine (Large — Future)

**Goal:** Plugin-based verification. **Prerequisite: 3+ distinct verification types exist. Do NOT build preemptively.**

| Deliverable                                | Status      | Est | Work Item |
| ------------------------------------------ | ----------- | --- | --------- |
| Define `EffectChecker<T>` plugin interface | Not Started | 2   | —         |
| Create `verifyTxEffects` state machine     | Not Started | 2   | —         |
| Migrate DAO + Signal to plugins            | Not Started | 2   | —         |

## Constraints

- Must not break existing startup validation (Zod + chain alignment)
- Signature scheme must work with git-based governance (PRs, not out-of-band signing)
- Revocation list must be updatable without redeploying the app

## Dependencies

- [ ] DAO key management infrastructure (signing key provisioning)
- [ ] CI pipeline changes for build attestation
- [ ] Container registry support for attestation metadata

## As-Built Specs

- [chain-config.md](../../docs/spec/chain-config.md) — current repo-spec validation invariants

## Design Notes

Signed repo-spec track extracted from original `docs/CHAIN_CONFIG.md` "Long-Term Hardening" section during docs migration. Deployment verification track extracted from `docs/CHAIN_DEPLOYMENT_TECH_DEBT.md`.

### Deployment Verification Design (from CHAIN_DEPLOYMENT_TECH_DEBT.md)

**Invariants (to enforce once implemented):**

1. **Single Evidence Object**: Receipt data (blockNumber, blockHash, contractAddress, status, logs) flows as one typed object, never as individual fields.
2. **Block-Aware by Default**: All on-chain reads (getBytecode, readContract) use at-or-after `evidence.blockNumber`, with fallback for non-archive providers.
3. **Progressive Abstraction**: Do NOT introduce a generalized plugin framework until 3+ distinct verification types exist.

**TxEvidence Type:**

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

**Why single object?** Eliminates N-field propagation. Using `bigint` matches viem types and avoids repeated coercion bugs.

**Data Flow (Tier 1):**

```
CLIENT: Build TxEvidence from receipt
  1. useWaitForTransactionReceipt() returns receipt
  2. Build TxEvidence { txHash, blockNumber, blockHash, status, ... }
  3. Dispatch SIGNAL_TX_CONFIRMED with evidence
  4. Call verifyFormation({ ..., signalEvidence })
       │
       ▼
SERVER: Use at-or-after evidence.blockNumber for reads
  - Try: getBytecode({ address, blockNumber: evidence.blockNumber })
  - Fallback: If provider error, validate via blockHash or PENDING
  - readContract({ ..., blockNumber: evidence.blockNumber })
  - Prefer specific block over "latest" for deployment verification
```

**Why block-aware by default?** Eliminates cross-RPC race conditions where client's RPC has indexed a block but server's RPC hasn't. Fallback for non-archive providers: verify block exists via `getBlock(evidence.blockHash)` and retry at "latest" or return `PENDING` with `retryAfterMs`.

**TxEvidence vs Full Receipt:**

| Field             | Included       | Reason                             |
| ----------------- | -------------- | ---------------------------------- |
| `txHash`          | Yes            | Identifies transaction             |
| `blockNumber`     | Yes            | Required for block-aware reads     |
| `blockHash`       | Yes            | Allows block-specific verification |
| `status`          | Yes            | Fast-fail on reverted tx           |
| `contractAddress` | Yes (optional) | Present for deployments            |
| `logs`            | No (Tier 2)    | Only needed for event extraction   |

**Error handling (future Tier 2):** Helper returns `Result<T, VerificationError>` with typed error variants: `NOT_FOUND`, `MISMATCH`, `RPC_ERROR`. Current inline try/catch with `string[]` errors.
