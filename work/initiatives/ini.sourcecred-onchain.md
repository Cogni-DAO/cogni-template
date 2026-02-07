---
work_item_id: ini.sourcecred-onchain
work_item_type: initiative
title: SourceCred On-Chain Integration
state: Paused
priority: 3
estimate: 3
summary: Generic Cred→CSV→Safe integration in cogni-template so forks can activate on-chain payouts via config
outcome: cogni-template ships generic payout script and CI job; forks (e.g., cogni-canary) activate with env vars
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - sourcecred
  - web3
  - community
---

# SourceCred On-Chain Integration

> Source: SOURCECRED.md Phases 3–4

## Goal

Implement generic Cred→CSV→Safe integration in `cogni-template` so forks can activate on-chain payouts via config. `cogni-template` itself will never enable on-chain integration (invariant NO_ONCHAIN_IN_TEMPLATE) — this is plumbing for forks.

## Roadmap

### Crawl (P0): Generic On-Chain Plumbing (Phase 3)

**Goal:** CSV grain output, idempotent payout script, CI job with dry-run default.

| Deliverable                                                                  | Status      | Est | Work Item |
| ---------------------------------------------------------------------------- | ----------- | --- | --------- |
| Enable CSV Grain output in SourceCred config                                 | Not Started | 1   | —         |
| `scripts/sourcecred-safe-payout.ts` — CSV → Safe transaction JSON            | Not Started | 2   | —         |
| Idempotent payout script (env vars for Chain ID, Token, Safe — no hardcodes) | Not Started | 1   | —         |
| GitHub Action job — runs payout script, dry-run if env vars missing          | Not Started | 1   | —         |
| Tests for CSV parsing and Safe payload generation                            | Not Started | 1   | —         |

### Walk (P1): Per-Node Activation (Phase 4)

**Goal:** First live node activation. Executes in forks only (e.g., `cogni-canary`).

> `cogni-canary` is a sacrificial testbed whose configs and economics may be broken on purpose to learn.

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| Fork `cogni-template` → `cogni-canary`                                 | Not Started | 1   | —         |
| Deploy Token, Safe, Aragon DAO on chosen chain (e.g., Base Sepolia)    | Not Started | 2   | —         |
| Configure env: `SOURCECRED_PAYOUT_SAFE_ADDRESS`, `TOKEN_ADDRESS`, etc. | Not Started | 1   | —         |
| Enable CI: switch payout job from `dry-run` to `propose` (or `auto`)   | Not Started | 1   | —         |

## Constraints

- **NO_ONCHAIN_IN_TEMPLATE**: `cogni-template` will never enable CSV/on-chain integration — this is fork-only plumbing
- Manual distributions: never auto-merge grain PRs — each distribution is a human-approved event
- Payout script must be idempotent and use env vars exclusively (no hardcoded addresses)

## Dependencies

- [ ] SourceCred Phases 1-2 (complete)
- [ ] Safe deployment on target chain (for Phase 4)

## As-Built Specs

- [sourcecred.md](../../docs/spec/sourcecred.md) — SourceCred configuration, invariants, and operational rules
- [sourcecred-config-rationale.md](../../docs/spec/sourcecred-config-rationale.md) — weight and policy rationale

## Design Notes

_(none yet)_
