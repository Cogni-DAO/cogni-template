---
id: spec.sourcecred
type: spec
title: SourceCred Implementation
status: draft
spec_state: draft
trust: draft
summary: SourceCred configuration, operational invariants, and plugin/weight/grain settings for contribution tracking
read_when: Modifying SourceCred config, running grain distributions, or understanding contribution scoring
implements: []
owner: cogni-dev
created: 2025-11-15
verified: null
tags:
  - community
  - sourcecred
---

# SourceCred Implementation

## Context

SourceCred tracks contributions via GitHub plugin analysis (PRs, issues, reviews, comments). It runs as a Docker service, outputs a scoreboard, and distributes grain (internal contribution currency). Phases 1-2 (infrastructure + configuration) are complete. On-chain integration is deferred to forks.

Scope: `Cogni-DAO/cogni-template` only. Per-node activation (e.g., `CogniCanary`) is fork-specific.

## Goal

Define the SourceCred configuration, scoring weights, allocation policies, and operational invariants that govern contribution tracking in this repo.

## Non-Goals

- On-chain CSV/Gnosis integration (see [ini.sourcecred-onchain](../../work/initiatives/ini.sourcecred-onchain.md))
- Per-node fork activation (see initiative Walk phase)
- Discord or Discourse plugin integration

---

## Core Invariants

1. **NO_ONCHAIN_IN_TEMPLATE**: `cogni-template` will never enable CSV/on-chain integration. This is fork-only plumbing.

2. **MANUAL_DISTRIBUTIONS**: Never auto-merge grain PRs. Each distribution is a human-approved event.

3. **IDLE_HANDLING**: Skip grain distributions (or leave PR unmerged) during idle periods.

4. **LEGACY_STATUS**: SourceCred is legacy/temporary, with a migration plan to CogniCred.

5. **BUDGET_SAFETY**: Keep BALANCED budget share <= 40% and monitor for odd oscillations.

6. **IDENTITY_OPT_IN**: Only add identities to ledger after CogniTemplate waiver/opt-in is recorded.

---

## Design

### Implementation Status

- **Phase 1: Infrastructure** — Complete (PR #161). Service stack, Docker, CI/CD.
- **Phase 2: Configuration** — Complete. Weights, Grain, Plugins.

### Design Decisions

**Agreed:**

- GitHub-only plugin — no Discord or Discourse integration.
- Single currency ("CogniTemplate") — forks rename to their own.
- Manual approval — all distributions require human sign-off.
- Signal-over-noise — comments and low-signal surfaces strongly de-weighted.

**Contested decisions (resolved):**

- Allocation Policy: **RECENT + BALANCED** (vs RECENT-only).
- Integration: **Scoreboard-only v0** (vs CSV/Gnosis integration).
- Reactions: **Zero weight** for v0 (vs positive weight).
- Balanced Budget: **Capped budget share** (vs avoiding BALANCED).

For rationale, see [sourcecred-config-rationale.md](./sourcecred-config-rationale.md).

### Configuration

**`grain.json`:**

- Max Simultaneous Distributions: `1`
- Allocation Policies: `RECENT` (budget `600`, discount `0.6`), `BALANCED` (budget `400`, lookback `0`)
- Disabled: `integration`, `accountingEnabled` (scoreboard-only)

**`weights.json`:**

- `ISSUE`: 2, `PULL`: 10, `REVIEW`: 4, `COMMENT`: 0.5
- `reactionEdgeWeightsAll` = `0`

**`sourcecred.json`:**

- Bundled Plugins: `["sourcecred/github"]`

**`currencyDetails.json`:**

- Name: "CogniTemplate", Suffix: " COGTMP", Integration: `null`

**`github_config.json`:**

- Repo: `Cogni-DAO/cogni-template`, Include Developers: `true`, Exclude Bots: `true`

### File Pointers

| File                                                                                       | Purpose                   |
| ------------------------------------------------------------------------------------------ | ------------------------- |
| `platform/infra/services/sourcecred/instance/config`                                       | Instance config directory |
| `platform/infra/services/sourcecred/instance/config/plugins/sourcecred/github/config.json` | GitHub plugin config      |
| `platform/infra/services/sourcecred/docker-compose.sourcecred.yml`                         | Docker service definition |

## Acceptance Checks

**Manual:**

1. Run `docker compose -f docker-compose.sourcecred.yml up` — verify scoreboard generates
2. Verify grain distribution PR requires manual merge (no auto-merge)
3. Verify `reactionEdgeWeightsAll` = `0` in weights config

## Open Questions

_(none)_

## Related

- [sourcecred-config-rationale.md](./sourcecred-config-rationale.md) — weight and policy rationale
- [Initiative: SourceCred On-Chain](../../work/initiatives/ini.sourcecred-onchain.md)
