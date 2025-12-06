# SourceCred Implementation Spec

> **Scope**: This document applies to `Cogni-DAO/cogni-template`. Phase 3 implements generic plumbing in this repo. Phase 4 is for per-node activation (e.g., `CogniCanary`).

## Implementation Status

- [x] **Phase 1: Infrastructure** (Service stack, Docker, CI/CD) - _Completed in PR #161_
- [x] **Phase 2: Configuration** (Weights, Grain, Plugins)
  - [x] `sourcecred.json`
  - [x] `currencyDetails.json`
  - [x] `github_config.json`
  - [x] `grain.json`
  - [x] `weights.json`
- [ ] **Phase 3: Generic On-Chain Integration** (CSV, Safe Script, CI)
- [ ] **Phase 4: Per-Node Activation** (e.g., CogniCanary)

## Alignment Summary

### Agreed

- **GitHub-only plugin**: No Discord or Discourse integration.
- **Single Currency (Template)**: "CogniTemplate" only; `CogniCanary` fork will rename to "CanaryCogni" (or similar).
- **Manual Approval**: All distributions require human sign-off (no auto-merge).
- **Signal-over-Noise**: Comments and low-signal surfaces are strongly de-weighted.

For the detailed "why" behind our configuration, see [SOURCECRED_CONFIG_RATIONALE.md](SOURCECRED_CONFIG_RATIONALE.md).

### Disagreed (Decisions)

- **Allocation Policy**: We use **RECENT + BALANCED** (vs RECENT-only).
- **Integration**: We use **Scoreboard-only v0** (vs CSV/Gnosis integration).
- **Reactions**: **Zero weight** for v0 (vs positive weight).
- **Balanced Budget**: **Capped budget share** (vs avoiding BALANCED).

## Configuration Specifications

### `grain.json`

- **Max Simultaneous Distributions**: `1`
- **Allocation Policies**:
  - `RECENT`: Budget `600`, Discount `0.6`
  - `BALANCED`: Budget `400`, Lookback `0`
- **Disabled**: `integration`, `accountingEnabled` (CSV/accounting integration is not configured in this repo; scoreboard-only).

### `weights.json`

- **Adopt**: Node/Edge weights from standard architecture:
  - `ISSUE`: 2
  - `PULL`: 10
  - `REVIEW`: 4
  - `COMMENT`: 0.5
- **Override**: `reactionEdgeWeightsAll` = `0`

### `sourcecred.json`

- **Bundled Plugins**: `["sourcecred/github"]`

### `currencyDetails.json`

- **Name**: "CogniTemplate"
- **Suffix**: " COGTMP"
- **Integration**: `null`

### `github_config.json`

- **Repo**: `Cogni-DAO/cogni-template`
- **Include Developers**: `true`
- **Exclude Bots**: `true`

## Operational Invariants

> [!IMPORTANT]
> These invariants must be strictly maintained.

1.  **No Crypto Integration (v0)**: Do not enable CSV/Gnosis integration until an explicit Phase 2 decision.
2.  **Manual Distributions**: Never auto-merge grain PRs. Each distribution is a human-approved event.
3.  **Idle Handling**: Skip grain distributions (or leave PR unmerged) during idle periods.
4.  **Legacy Status**: Document SourceCred as legacy/temporary, with a migration plan to CogniCred.
5.  **Budget Safety**: Keep BALANCED budget share <= 40% and monitor for odd oscillations.
6.  **Identity**: Only add identities to ledger after CogniTemplate waiver/opt-in is recorded.
7.  **No On-Chain in Template**: `cogni-template` will never enable CSV/on-chain integration.

## File Pointers

- **Instance Config**: `platform/infra/services/sourcecred/instance/config`
- **Repositories**: `platform/infra/services/sourcecred/instance/config/plugins/sourcecred/github/config.json`
- **Docker**: `platform/infra/services/sourcecred/docker-compose.sourcecred.yml`

## Phase 3: Generic On-Chain Integration (In Progress)

**Goal**: Implement generic Cred->CSV->Safe integration in `cogni-template` so forks can activate it via config.

### Tasks

- [ ] **Enable CSV Grain**: Configure SourceCred to output CSV grain reports (generic).
- [ ] **Payout Script**: Add `scripts/sourcecred-safe-payout.ts` to convert CSV -> Safe transaction JSON.
  - Must be idempotent.
  - Must use env vars for Chain ID, Token Address, Safe Address (no hardcoded values).
- [ ] **CI Integration**: Add a GitHub Action job that runs the payout script.
  - Runs in `dry-run` mode if env vars are missing.
- [ ] **Tests**: Add basic tests to verify CSV parsing and Safe payload generation.

## Phase 4 (Per-Node Activation): On-Chain Integration

> [!NOTE]
> Tasks in this phase execute **only** in forks (e.g., `cogni-canary`).

**Goal**: Activate the generic plumbing for a specific node (e.g., CogniCanary).

### Example: CogniCanary (Sacrificial Testbed)

`cogni-canary` is the first live experimental node. It is a **sacrificial testbed** whose configs and economics may be broken on purpose to learn.

### Activation Tasks

- [ ] **Pre-requisite**: Fork `cogni-template` into `cogni-canary`.
- [ ] **Deploy Infra**: Deploy Token, Safe, and Aragon DAO on chosen chain (e.g., Base Sepolia).
- [ ] **Configure Env**: Set `SOURCECRED_PAYOUT_SAFE_ADDRESS`, `SOURCECRED_PAYOUT_TOKEN_ADDRESS`, etc.
- [ ] **Enable CI**: Set CI variables to switch the payout job from `dry-run` to `propose` (or `auto` for testnets).
