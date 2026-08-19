---
id: tokenomics-spec
type: spec
title: "Tokenomics: Budget Policy + Settlement Handoff"
status: draft
spec_state: proposed
trust: draft
summary: "Tokenomics contract for hard-capped credit budgeting and settlement-layer handoff. Defines simple epoch budget policy, one user-facing unit, and how finalized credits hand off to future token settlement."
read_when: Understanding credit economics, pool sizing, emission schedules, or settlement design.
implements: proj.transparent-credit-payouts
owner: derekg1729
created: 2026-03-02
verified: 2026-03-03
tags: [governance, tokenomics, attribution]
---

# Tokenomics: Budget Policy + Settlement Handoff

> The attribution pipeline answers "who did what." This spec answers "how much is the pool, where does it come from, and what do the numbers mean to the user."
>
> **SSOT for the distribution goal + cohesive e2e flow:** operator hub entry `node-tokenomics-distribution-goal` (domain `governance`) — recall before touching `txBuilders`, the wizard, `activate-distributions`, or distributor work. The locked goal: _a DAO, with a token supply, distributed by a Merkle distributor based on signed epoch ledgers_ — DAO-is-minter, mint-per-epoch, metadata-only activation as a visible owner checkpoint, no human token moves.

## Goal

Replace arbitrary, inflationary credit issuance with principled tokenomics:

1. **One user-facing unit** — kill the score/credits split
2. **Hard-capped credit budget** — finite pool, no infinite minting
3. **Deterministic epoch pools** — policy function, not admin discretion
4. **Flat eligible-epoch budget** — quiet weeks spend nothing; later eligible epochs still use the same deterministic `accrual_per_epoch` cap
5. **Separation of concerns** — attribution (governance truth) vs. settlement (financial truth) vs. governance (voting power)

## Non-Goals

- Deploying smart contracts (Crawl phase is off-chain only)
- Token trading, liquidity pools, or price discovery
- Multi-token architecture in Crawl
- Changing the attribution pipeline math (weights, enrichers, allocators stay as-is)

## Problems with Status Quo

| Problem                     | Evidence                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Infinite inflation**      | The prior uncapped per-epoch constant could mint forever. The finite policy removes that path.            |
| **Two meaningless numbers** | UI shows "Score" (`units/1000`) AND "Credits" (`proportional share × pool`). Neither has intrinsic value. |
| **Magic pool size**         | The prior pool copied a configuration constant without a supply cap.                                      |
| **No scarcity signal**      | Credits accumulate without bound. No reason to value them.                                                |
| **Admin discretion risk**   | If admin could set `epoch_pool` arbitrarily, trust breaks.                                                |

## Invariants

| Rule                            | Constraint                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUDGET_CONSERVATION_POLICY      | `SUM(all epoch_pools ever) ≤ budget_total`. In Crawl and Walk this is signed governance/process enforcement backed by auditable reservations, not an adversarial on-chain cap.                          |
| EPOCH_POOL_DETERMINISTIC        | `epoch_pool = min(accrual_per_epoch, remaining)` when allocation finds included receipts, otherwise `0`. The amount is a policy function, never an admin input.                                         |
| ONE_USER_FACING_UNIT            | Users see one number in one denomination. Internal milli-units are never displayed.                                                                                                                     |
| BUDGET_RESERVATIONS_APPEND_ONLY | Immutable `budget_reservation` rows make `remaining` replayable and auditable. The DB adapter serializes reservations on the unique open epoch.                                                         |
| SETTLEMENT_DECOUPLED            | Attribution statements are governance commitments. Settlement (how entitlements become claims) is a separate, pluggable layer.                                                                          |
| GOVERNANCE_REWARD_PLUGGABLE     | The attribution pipeline outputs `creditAmount`. Whether credits settle into the same governance token or separate instruments is a settlement-layer decision. Attribution remains instrument-agnostic. |

## Design

---

### Crawl — Fix the Economics (Off-Chain, No Token)

**Ship first. No contracts. No token. Just correct the math and the UI.**

#### C1. Kill "Score" — One Number, One Name

| Before                                    | After                                                            |
| ----------------------------------------- | ---------------------------------------------------------------- |
| UI: "Score" column = `units/1000`         | **Gone.**                                                        |
| UI: "Credits" = proportional share × pool | **"Credits Earned"** — the only number shown.                    |
| `creditAmount` in DB                      | Unchanged — still BIGINT, still the output of allocation math.   |
| `units` / `finalUnits` in DB              | Unchanged — still internal pipeline state. Never shown to users. |

The UI shows: **"You earned 3,420 credits this epoch (34.2% of pool)"**

"Credits" remain the unit. They are off-chain ledger entries — signed governance commitments. What they're _worth_ is a settlement concern (Walk phase).

**Files changed:**

- `src/features/governance/components/EpochDetail.tsx` — remove "Score" column, keep "Share" + "Credits Earned"
- `src/features/governance/components/ContributionRow.tsx` — remove score display, show weight as tooltip only

#### C2. Budget Policy — Finite Supply + Flat Epoch Budget

Use one hard-capped budget policy derived at formation.

```
┌─────────────────────────────────────────────────────────────┐
│  Budget policy (per scope)                                  │
│                                                             │
│  budget_total: 520,000 credits  (finite policy total)       │
│  remaining:    520,000          (decremented per epoch)      │
│                                                             │
│  accrual_per_epoch:  10,000     (credits released per epoch) │
│                                                             │
│  epoch_pool = hasIncludedReceipts                            │
│            ? min(accrual_per_epoch, remaining)              │
│            : 0                                              │
│                                                             │
│  After epoch: remaining -= epoch_pool                       │
│                                                             │
│  When remaining = 0 → no more credits. Ever.                │
└─────────────────────────────────────────────────────────────┘
```

**Prototype default behaviors:**

- **Normal week**: epoch spends 10K if there are included receipts and `remaining ≥ 10K`.
- **Quiet week** (no activity): epoch_pool = 0. `remaining` is unchanged.
- **Busy week after quiet**: epoch still spends 10K. Quiet weeks do not create burst issuance.
- **Budget exhausted**: remaining = 0. No more credits issued. Period. (Governance can vote to extend — that's a new budget allocation, not an edit.)

Carry-over is deliberately **deferred from the first prototype**. If governance later wants deferred issuance, that becomes a new budget policy decision rather than hidden state in the MVP accounting layer.

**Why `epoch_pool` is NOT admin-settable:**
The admin controls _what activity counts_ (include/exclude receipts, weight overrides, identity resolution). The admin does NOT choose the pool size during the normal flow: it is computed from signed policy and reservation state. This makes over-issuance detectable and rejects it in the supported process, but it does not stop a compromised DAO minter from minting outside that process.

#### C3. repo-spec.yaml Changes (Crawl)

```yaml
activity_ledger:
  epoch_length_days: 7
  approvers: ["0x..."]
  budget_policy:
    budget_total: "520000" # finite signed policy total (credits, not tokens yet)
    accrual_per_epoch: "10000" # credits released per eligible epoch
  activity_sources:
    github:
      attribution_pipeline: cogni-v0.0
      source_refs: ["cogni-dao/cogni-template"]
      streams: ["pull_requests", "reviews", "issues"]
```

`budget_policy` is the only supported runtime configuration. Existing immutable epoch
rows remain historical evidence; all new reservations use the finite policy.

#### C4. Code Changes (Crawl)

| File                                      | Change                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/repo-spec/src/schema.ts`        | Requires `budget_policy` whenever `activity_ledger` is configured.                               |
| `packages/repo-spec/src/accessors.ts`     | Exposes positive bigint policy values.                                                           |
| `packages/attribution-ledger/src/pool.ts` | Pure `flat-cap-v1` computation; quiet and exhausted epochs return no reservation.                |
| `packages/db-client/`                     | Locks the unique open epoch and performs status, scoped sum, cap, and insert in one transaction. |
| `services/scheduler-worker/`              | Reserves the finite amount after allocation establishes whether the epoch has included receipts. |

#### C5. Budget Policy State Machine

```
                    ┌──────────────┐
     close epoch ──►│   COMPUTE     │──► if included receipts exist:
                    │   EPOCH_POOL  │      epoch_pool = min(accrual, remaining)
                    └──────┬───────┘    else:
                                           epoch_pool = 0
                           │
                           ▼
                    ┌──────────────┐
     finalize    ──►│    SPEND      │──► remaining -= epoch_pool
                    │              │    pool_total locked on statement
                    └──────────────┘    (existing POOL_REPRODUCIBLE invariant)
```

If `remaining = 0`, `epoch_pool = 0`. Epoch still runs (activity is recorded for transparency) but no credits are distributed.

---

### Enforcement Progression — Where the Budget Constraint Actually Lives

The supported attribution pipeline conserves the finite policy budget through an atomic reservation and includes the result in a signed statement. In Crawl and Walk, that is auditable governance/process enforcement: a bug, privileged direct write, compromised signer, or direct DAO mint can still violate policy. The first adversarial, contract-enforced cap belongs to Run.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CRAWL (off-chain only)                                                 │
│                                                                         │
│  budget_total + accrual     → repo-spec.yaml                            │
│  remaining                 → derived from immutable reservations       │
│  Enforcement:               → atomic scoped sum + capped reservation    │
│  Enforcement class:        → signed process + auditable conservation   │
├─────────────────────────────────────────────────────────────────────────┤
│  WALK (first token claims)                                              │
│                                                                         │
│  Policy remaining           → budget_total minus signed reservations    │
│  budget_total in Postgres   → auditable governance/process authority    │
│  accrual_per_epoch          → repo-spec.yaml (human-verified per epoch) │
│  Enforcement:               → Safe signers verify amount ≤ policy       │
│                                before authorizing each release.         │
│  Enforcement class:         → signer/process control; a signer with DAO │
│                                mint authority can still overmint.        │
├─────────────────────────────────────────────────────────────────────────┤
│  RUN (on-chain enforcement)                                             │
│                                                                         │
│  EmissionsController.maxPerEpoch      → on-chain, immutable per era     │
│  EmissionsController.totalReleased    → on-chain counter                │
│  Enforcement:                         → require() reverts over-budget tx │
│  Postgres budget reservations         → index/cache, not source of truth│
│  repo-spec accrual_per_epoch          → read from contract state        │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** `policySupply - genesisMint` is the finite governance-policy total for contributor distribution. Current formation puts `genesisMintUnits` on-chain and grants the DAO mint authority; the token contract does **not** encode `policySupply` or prevent an authorized signer from overminting. Crawl reservations and Walk signatures provide auditable conservation in the intended process. Run's budget controller is the first contract boundary that can revert a release exceeding the configured cap.

---

### Walk + Run — Settlement Handoff Contracts

> **These phases are design inputs for [proj.financial-ledger](../../work/projects/proj.financial-ledger.md).** This spec defines the economics and handoff constraints only; the settlement roadmap lives in the project.

Credits distributed by the attribution pipeline represent **equity ownership / governance stake** — not cash compensation. The MVP settlement path is single-token:

```
Attribution credits (off-chain)
  → Aragon GovernanceERC20 claims (on-chain)
  → Voting power + ownership claim
```

**Settlement contracts:**

- The settlement token is the Aragon `GovernanceERC20` created at node formation.
- Current P0 formation mints only a template-computed genesis amount to the explicit initial holder and models the rest as future supply that is not yet minted. That proves Aragon formation and verification without pretending a distribution rail exists.
- The DAO is the GovernanceERC20 **minter**, not a pre-minted treasury. Aragon's `TokenVotingSetup` grants the DAO `MINT_PERMISSION` on the token at formation, so emissions supply is **minted per-epoch by the DAO into the distributor** — never a fixed pile parked in a vault, and never a human-moved float. Future, unissued supply is policy math (a cap), realized only when the DAO mints it under a signed root.
- The typed handoff model lives in `@cogni/aragon-osx` as `buildDaoTokenSettlementModel()`. NOTE (Walk reconciliation): its inventory readiness still models a pre-minted DAO balance (`formation_probe_only` → `inventory_ready`); under the mint-per-epoch model, "inventory ready" is **DAO mint authority + a finalized signed statement + an executed mint-into-distributor**, not a parked balance. Reconcile in Walk P0.
- Before Walk settlement can go live, repo-spec must carry `distributions.status: active`, `governance.token_contract`, `governance.emissions_holder`, and the selected OSS claim pattern. Activation is a git-governed node repo-spec PR, surfaced as a **visible owner-driven node checkpoint** (not a hidden API, not a formation-only checkbox): new nodes and existing DAO nodes both use the same update flow. Activation is **metadata-only** — it verifies the token + DAO contracts **exist on-chain (bytecode present)** and records `emissions_holder = the DAO contract` (the minter); it **never checks token balance and never moves tokens**, because nothing is pre-minted.
- Crawl budget policy remains off-chain accounting and governance policy. It is not the hard security boundary for token release.
- In Walk, the source of truth for remaining supply is `emissionsHolder.balanceOf(token)` on-chain, not Postgres. Off-chain `remaining` becomes a reconciliation check.
- Walk uses OSS primitives: OpenZeppelin Merkle Tree tooling for manifest/proof generation and a stock audited per-epoch distributor such as Uniswap MerkleDistributor for claims. Bespoke on-chain release or mint-on-claim contracts are out of scope unless a separate contract-selection spike proves they are required.
- Merkle settlement consumes signed `creditAmount` entitlements from the finalized statement, not internal `finalUnits`.
- USDC distributions remain a separate, governance-voted financial action.

#### Edge Cases

| Edge Case               | Resolution                                                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `total_points = 0`      | Epoch pool = 0. No statement produced. Quiet epochs do not create larger future distributions in the prototype policy.                                                                 |
| Unresolved claimants    | Already handled by `IdentityClaimant` type. Claimant key is stable (`identity:github:12345`). Statement finalization can proceed, but on-chain settlement waits for wallet resolution. |
| Address changes         | Wallet binding layer (existing `user_bindings`). Statement references `claimantKey`, not wallet address. Claim address resolved at settlement time.                                    |
| Forked scopes           | Each scope has its own budget policy and budget cap. Fork = new scope = new supply budget. No cross-contamination.                                                                     |
| Root rotation authority | Walk: Safe/manual or equivalent trusted governance execution publishes roots and funding. Run: Governor/Timelock or stronger on-chain authorization gates it.                          |
| Unclaimed tokens        | `sweep(epochId)` after claim window → treasury. Swept amounts are NOT re-emitted.                                                                                                      |

## OSS Building Blocks

| Need                | OSS                                              | Status                           |
| ------------------- | ------------------------------------------------ | -------------------------------- |
| Governance token    | Aragon GovernanceERC20 (from node formation)     | Walk                             |
| Merkle tooling      | OpenZeppelin Merkle Tree                         | Crawl/Walk                       |
| Merkle claims       | Uniswap MerkleDistributor (per-epoch, preferred) | Walk                             |
| Governance          | OpenZeppelin Governor + TimelockController       | Run                              |
| Streaming (alt)     | Sablier Lockup / Superfluid                      | Run (optional)                   |
| Double-entry ledger | Beancount                                        | Walk (via proj.financial-ledger) |

## What Does NOT Change

- Epoch lifecycle (open → review → finalized)
- Weight config per event type
- Allocation algorithms (weight-sum-v0, future versions)
- EIP-712 signing flow
- Plugin system (enrichers, allocators)
- Claimant model (user vs identity)
- All 79 attribution-ledger invariants
- BIGINT math, largest-remainder rounding
- Determinism guarantees
