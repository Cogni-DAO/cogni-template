---
id: sourcecred-config-rationale-spec
type: spec
title: SourceCred Configuration Rationale
status: active
spec_state: draft
trust: draft
summary: Why CogniTemplate uses SourceCred v0 as a GitHub-only contribution scoreboard, what the cred/grain configuration optimizes for, and its deliberate limitations.
read_when: Modifying SourceCred config, running grain distributions, or evaluating contribution scoring alternatives.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [community]
---

# SourceCred Configuration Rationale

## Context

SourceCred v0 exists only as a GitHub-only contribution scoreboard for the CogniTemplate repo. It mints a single internal unit, CogniTemplate (COGTMP), that tracks contribution history. It is a temporary, legacy system that will be replaced by CogniCred or a custom successor. It does not directly control treasury, equity, or on-chain tokens.

## Goal

Provide a transparent, GitHub-based contribution scoreboard with controlled incentives and strict operational invariants, optimizing for early risk-taker upside, newcomer participation, spam resistance, and treasury safety.

## Non-Goals

- Direct treasury control or on-chain token distribution (CogniTemplate is a scoreboard, not a payment promise)
- Non-GitHub contribution surfaces (Discord, Discourse, etc.)
- Automated grain distributions (all distributions are manual/human-approved)

## Core Invariants

1. **GITHUB_ONLY_SURFACE**: Only the `sourcecred/github` plugin is enabled. No Discord, Discourse, initiatives, or other plugins.

2. **SINGLE_CURRENCY_NO_CRYPTO**: `currencyName = "CogniTemplate"`, `integrationCurrency = null`. No CSV/Gnosis integration in `grain.json` for v0. CogniTemplate is a scoreboard, not a promise of payment.

3. **MANUAL_DISTRIBUTIONS_ONLY**: Grain distributions are never auto-merged. Each distribution is a human-approved PR or explicit CLI run.

4. **IDLE_PERIODS_DO_NOT_MINT**: If the project is idle, skip distributions (or leave PRs unmerged). Do not emit new CogniTemplate during long idle stretches.

5. **RECENT_PLUS_BALANCED_ALLOCATION**: RECENT (most recent work) has majority of the budget. BALANCED has capped budget share (≤40%) and corrects historical underpayment. No IMMEDIATE policy and no backfill of missed distributions.

6. **SIGNAL_OVER_NOISE**: Merged PRs and reviews carry most weight. Comments, references, and other low-signal surfaces are heavily de-weighted. All reaction-based edges (emoji) have zero weight in v0.

7. **IDENTITY_AND_CONSENT**: Only add identities to the ledger after the contributor has explicitly opted in / signed the CogniTemplate waiver. Identity merges (multiple GitHub accounts) are manual and auditable.

8. **LEGACY_TEMPORARY_STATUS**: SourceCred is unmaintained upstream and is treated as legacy infra. Will be replaced or superseded once CogniCred or another system is ready.

## Design

### Incentive Design

The configuration optimizes for:

- **Early risk-takers keep upside**: BALANCED ensures contributors who did a lot of work early but were underpaid still get pulled upward over time.
- **Newcomers can matter quickly**: RECENT with a strong budget share rewards current work. A newcomer who contributes serious PRs now can gain meaningful CogniTemplate even if others have a long history.
- **No idle inflation**: When nobody is working, distributions should not mint new CogniTemplate. Enforced operationally by not running/merging grain during idle.
- **Quality over spam**: High weight on merged PRs and reviews. Low weight on comments and references makes comment farming / tag spam uneconomic. Reactions are zeroed to avoid popularity contests.
- **Treasury safety and legal clarity**: SourceCred does not directly move funds. Multisigs, governance, and separate processes decide if any CogniTemplate ever maps to real tokens or cash.

### Key Scenarios

- **Founders and early builders**: Accrue Cred early and, through BALANCED, retain long-term upside even after activity slows. Relative share decreases if they stop contributing, but does not vanish.
- **New wave of contributors**: RECENT allocates a large portion of new CogniTemplate to current work. Newcomers can meaningfully participate without being crushed by historical balances.
- **Six-month idle stretch**: No distributions, no new CogniTemplate minted. Rely on operational discipline, not algorithmic magic.
- **Spammy comments or low-effort PRs**: Low comment weights and review + merge gates make earning Cred via spam costly. Maintainers can still reject low-quality work at the repo level.
- **Ledger disputes and corrections**: All distributions and identity changes are in Git history. Disputes resolved by human review, then reflected in updated config/ledger commits.

### Known Shortcomings

- **Surface-level understanding only**: SourceCred sees GitHub events and plugin metrics, not real-world value or intent. Cannot distinguish a brilliant 100-line refactor from a huge but low-value code dump except via human reactions and review decisions.
- **GitHub-blind to non-code work**: Work that does not appear as issues, PRs, or reviews is invisible unless manually represented in the repo.
- **No inherent governance safety**: SourceCred does not solve governance capture or plutocracy. Voting rules and DAO structure must handle caps, square-root voting, or multi-house designs.
- **Size and complexity of work are approximated**: A small but critical PR and a large but trivial PR may receive similar weights unless humans intervene (e.g., via review rigor, code review norms).
- **Legacy, unmaintained software**: Pinned to a specific SourceCred version; upstream is effectively frozen. Long-term migrate to CogniCred or a successor designed with our needs in mind.

### File Pointers

| File           | Role                                                      |
| -------------- | --------------------------------------------------------- |
| `.sourcecred/` | SourceCred configuration directory                        |
| `grain.json`   | Grain distribution policy (RECENT + BALANCED allocations) |

## Acceptance Checks

**Manual:**

1. Verify only `sourcecred/github` plugin is enabled (no other plugins)
2. Verify `integrationCurrency = null` (no crypto integration)
3. Verify grain distributions require manual PR approval

## Open Questions

_(none)_

## Related

- [Architecture](./architecture.md) — System overview
