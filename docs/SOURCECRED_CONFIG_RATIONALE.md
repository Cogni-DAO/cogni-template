# Cred Configuration Rationale (CogniTemplate v0)

This document explains why CogniTemplate uses SourceCred, what our cred/grain configuration is optimizing for, and what its limitations are. Treat this as a contract for how we think about contribution scoring in v0.

---

## Purpose

SourceCred v0 exists **only** as:

- A **GitHub-only contribution scoreboard** for the CogniTemplate repo.
- A way to mint a single internal unit, **CogniTemplate (COGTMP)**, that tracks contribution history.
- A temporary, legacy system that will be replaced by **CogniCred** or a custom successor.

It does **not** directly control treasury, equity, or on-chain tokens.

---

## Core Invariants

These are the rules that must not be broken:

1. **GitHub-only surface**
   - Only the `sourcecred/github` plugin is enabled.
   - No Discord, Discourse, initiatives, or other plugins.

2. **Single currency, no crypto integration**
   - `currencyName = "CogniTemplate"`, `integrationCurrency = null`.
   - No CSV/Gnosis integration in `grain.json` for v0.
   - CogniTemplate is a scoreboard, not a promise of payment.

3. **Manual distributions only**
   - Grain distributions are never auto-merged.
   - Each distribution is a human-approved PR or explicit CLI run.

4. **Idle periods do not mint**
   - If the project is idle, we skip distributions (or leave PRs unmerged).
   - We do not emit new CogniTemplate during long idle stretches.

5. **RECENT + BALANCED allocation**
   - RECENT (most recent work) has majority of the budget.
   - BALANCED has capped budget share (≤40%) and corrects historical underpayment.
   - No IMMEDIATE policy and no backfill of missed distributions.

6. **Signal over noise**
   - Merged PRs and reviews carry most weight.
   - Comments, references, and other low-signal surfaces are heavily de-weighted.
   - All reaction-based edges (emoji) have **zero weight** in v0.

7. **Identity and consent**
   - Only add identities to the ledger after the contributor has explicitly opted in / signed the CogniTemplate waiver.
   - Identity merges (multiple GitHub accounts) are manual and auditable.

8. **Legacy / temporary status**
   - SourceCred is unmaintained upstream and is treated as **legacy infra**.
   - We will replace or supersede it once CogniCred or another system is ready.

---

## Incentive Design

We are optimizing for:

- **Early risk-takers keep upside**
  - BALANCED ensures contributors who did a lot of work early but were underpaid still get pulled upward over time.

- **Newcomers can matter quickly**
  - RECENT with a strong budget share rewards current work.
  - A newcomer who contributes serious PRs now can gain meaningful CogniTemplate even if others have a long history.

- **No “idle inflation”**
  - When nobody is working, distributions should not mint new CogniTemplate.
  - This is enforced operationally by not running/merging grain during idle.

- **Quality over spam**
  - High weight on merged PRs and reviews.
  - Low weight on comments and references makes comment farming / tag spam uneconomic.
  - Reactions are zeroed to avoid popularity contests and quiet “you like me, I like you” games.

- **Treasury safety and legal clarity**
  - SourceCred does not directly move funds.
  - Multisigs, governance, and separate processes decide if any CogniTemplate ever maps to real tokens or cash.

---

## Key Scenarios

- **Founders and early builders**
  - They accrue Cred early and, through BALANCED, retain long-term upside even after activity slows.
  - Their relative share decreases if they stop contributing, but does not vanish.

- **New wave of contributors**
  - RECENT allocates a large portion of new CogniTemplate to current work.
  - Newcomers can meaningfully participate without being crushed by historical balances.

- **Six-month idle stretch**
  - The correct behavior is: no distributions, no new CogniTemplate minted.
  - We rely on operational discipline, not algorithmic magic, to enforce this.

- **Spammy comments or low-effort PRs**
  - Low comment weights and review + merge gates make earning Cred via spam costly.
  - Maintainers can still reject low-quality work at the repo level.

- **Ledger disputes and corrections**
  - All distributions and identity changes are in Git history.
  - Disputes are resolved by human review, then reflected in updated config/ledger commits.

---

## Known Shortcomings

This configuration has deliberate limitations:

- **Surface-level understanding only**
  - SourceCred sees GitHub events and plugin metrics, not real-world value or intent.
  - It cannot distinguish a brilliant 100-line refactor from a huge but low-value code dump except via human reactions and review decisions.

- **GitHub-blind to non-code work**
  - Work that does not appear as issues, PRs, or reviews is invisible unless it is manually represented in the repo.

- **No inherent governance safety**
  - SourceCred does not solve governance capture or plutocracy.
  - Voting rules and DAO structure must handle caps, square-root voting, or multi-house designs.

- **Size and complexity of work are approximated**
  - A small but critical PR and a large but trivial PR may receive similar weights unless humans intervene (e.g., via review rigor, code review norms).

- **Legacy, unmaintained software**
  - We pin to a specific SourceCred version and accept that upstream is effectively frozen.
  - Long-term we will migrate to CogniCred or a successor designed with our needs in mind.

---

In short: SourceCred v0 gives CogniTemplate a transparent, GitHub-based scoreboard with controlled incentives and strict operational invariants. It is a tool for **signal**, not an oracle of value, and it is not the final word on ownership or governance.
