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

Content extracted from original `docs/CHAIN_CONFIG.md` "Long-Term Hardening" section during docs migration. The `CHAIN_DEPLOYMENT_TECH_DEBT.md` roadmap doc will be merged into this initiative when migrated.
