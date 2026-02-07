---
work_item_id: ini.node-formation-ui
work_item_type: initiative
title: Node Formation UI & CLI Tooling
state: Active
priority: 2
estimate: 5
summary: Extend DAO formation beyond P0 web wizard — multi-holder, CLI setup tools, federation enrollment, encoding parity tests
outcome: Complete formation pipeline with CLI tooling, multi-holder support, federation enrollment, and automated e2e testing
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [web3, setup, cli]
---

# Node Formation UI & CLI Tooling

> Source: docs/NODE_FORMATION_SPEC.md

## Goal

Extend the P0 web DAO formation wizard (complete, manually validated on Base mainnet) to cover multi-holder token distribution, CLI-based setup tooling, automated e2e testing, encoding parity validation, and federation enrollment.

## Roadmap

### Crawl (P0) — Remaining P0 Items

**Goal:** Close remaining P0 gaps — automated e2e testing and encoding parity validation.

| Deliverable                                                                                                                                                                                                                                         | Status      | Est | Work Item |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Automated e2e testing (DAO formation flow with testnet)                                                                                                                                                                                             | Not Started | 2   | —         |
| Encoding parity test: TokenVoting setup encoding must match Foundry exactly (`packages/aragon-osx/src/__tests__/encoding.parity.test.ts`). Fixture generation: Run Foundry script with known inputs, capture encoded bytes, commit as test fixture. | Not Started | 2   | —         |

### Walk (P1) — Multi-Holder + CLI Setup Tools + Operator Registry

**Goal:** Multi-holder support, CLI setup tools, and operator node registry.

| Deliverable                                                                          | Status      | Est | Work Item            |
| ------------------------------------------------------------------------------------ | ----------- | --- | -------------------- |
| Multi-holder support (multiple initial token recipients)                             | Not Started | 2   | (create at P1 start) |
| Create `packages/setup-cli/` with Node adapters (fs, shell, gh, tofu)                | Not Started | 3   | (create at P1 start) |
| Implement `pnpm setup local` for contributor workflow                                | Not Started | 2   | (create at P1 start) |
| Implement `pnpm setup infra --env preview\|production`                               | Not Started | 2   | (create at P1 start) |
| Implement `pnpm setup github --env preview\|production`                              | Not Started | 2   | (create at P1 start) |
| Add WalletConnect adapter (CLI wallet signing if proven needed)                      | Not Started | 1   | (create at P1 start) |
| Operator-side `node_registry_nodes` table (see Design Notes §Operator Node Registry) | Not Started | 2   | (create at P1 start) |

### Run (P2+) — npx End-to-End + Federation Enrollment

**Goal:** Full npx-based onboarding and federation enrollment.

| Deliverable                                                                                              | Status      | Est | Work Item            |
| -------------------------------------------------------------------------------------------------------- | ----------- | --- | -------------------- |
| Evaluate P1 adoption before building npx flow                                                            | Not Started | 1   | (create at P2 start) |
| npx-based repo clone + init + DAO formation flow                                                         | Not Started | 3   | (create at P2 start) |
| Node-side persistence — Store formations in local `node_formations` table after verify succeeds          | Not Started | 2   | (create at P2 start) |
| Stable fingerprints — Verify endpoint emits `repo_spec_hash`, `cred_policy_hash`, `template_commit_hash` | Not Started | 2   | (create at P2 start) |
| Signed policy files — `.cogni/cred-policy.json` + `.cogni/cred-policy.sig` (detached signatures)         | Not Started | 2   | (create at P2 start) |
| Operator enrollment API — `POST /api/federation/enroll` with founder signature                           | Not Started | 2   | (create at P2 start) |
| Optional enroll UI — Post-formation button: "Enroll in Cogni Federation"                                 | Not Started | 1   | (create at P2 start) |

## Constraints

- Node Formation is Node-owned tooling — no Operator dependencies
- No private key env vars — all transactions signed via wallet UI
- Server derives ALL addresses from tx receipts (never trusts client)
- Package isolation: `aragon-osx` cannot import `src/`, `services/`, or browser/node-specific APIs
- Import boundaries: `packages/setup-cli` → `packages/aragon-osx` allowed; → `src/*`, `services/*` forbidden
- **Do NOT build npx flow preemptively** — evaluate after P1 adoption

## Dependencies

- [ ] Foundry fixtures for encoding parity test
- [ ] Testnet infrastructure for automated e2e
- [ ] P1 adoption metrics before building npx flow

## As-Built Specs

- [node-formation.md](../../docs/spec/node-formation.md) — P0 formation invariants, tech stack, server verification, schemas

## Design Notes

### Operator Node Registry (P1)

**Purpose:** Operator-side derived index for control-plane functions (entitlements, service routing). Does NOT violate Node sovereignty.

**Source of Truth:** On-chain receipts + Node-authored `repo-spec.yaml`. Operator table is rebuildable from these.

**Table:** `node_registry_nodes` (Operator DB, not Node DB)

| Column              | Type | Notes                                  |
| ------------------- | ---- | -------------------------------------- |
| `node_id`           | UUID | PK, Operator's canonical tenant key    |
| `chain_id`          | INT  | Network identifier                     |
| `dao_address`       | TEXT | From DAORegistered event               |
| `token_address`     | TEXT | From TokenVoting.getVotingToken()      |
| `plugin_address`    | TEXT | From InstallationApplied event         |
| `signal_address`    | TEXT | From CogniSignal deployment receipt    |
| `formation_tx_hash` | TEXT | Auditable reference to on-chain tx     |
| `repo_spec_hash`    | TEXT | Proves Operator consumed Node's policy |
| `status`            | TEXT | pending → confirmed → (reorged if bad) |

**Write Rules:**

- Insert only after server-side receipt verification succeeds
- Upsert on `(chain_id, formation_tx_hash)` to prevent duplicates
- Never delete; mark `reorged` if invalidated

**Sovereignty Invariants:**

- No private keys stored (addresses + receipts only)
- Node operation does not depend on this table
- Operator can rebuild from on-chain data

> See: [Node vs Operator Contract](../../docs/spec/node-operator-contract.md)

### Federation Enrollment (P2+)

**Goal:** Federation legitimacy requires opt-in enrollment; hostile forks cannot inherit it.

**Build Order:**

1. **Node-side persistence** — Store formations in local `node_formations` table after verify succeeds
2. **Stable fingerprints** — Verify endpoint emits `repo_spec_hash`, `cred_policy_hash`, `template_commit_hash`
3. **Signed policy files** — `.cogni/cred-policy.json` + `.cogni/cred-policy.sig` (detached signatures)
4. **Operator enrollment API** — `POST /api/federation/enroll` with founder signature
5. **Optional enroll UI** — Post-formation button: "Enroll in Cogni Federation"

**Licensing Policy:** Source-available (PolyForm Shield); forks permitted. Federation benefits (badges, payouts, datasets) require enrollment with signed CogniCred config. Non-compliant forks lose federation features, not code access.

> Full spec: [Cred Licensing Policy](../../docs/spec/cred-licensing-policy.md)

**Scope guardrails:** Formation stays Node-owned. No on-chain registry in MVP. No multi-holder prerequisite.
