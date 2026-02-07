---
work_item_id: ini.ci-cd-reusable
work_item_type: initiative
title: Reusable CI/CD Rails & Multi-Node Pipeline
state: Paused
priority: 3
estimate: 5
summary: Extract CI/CD workflows into reusable seams, then optionally into shared rails kit for multi-node deployment
outcome: CI workflows are reusable across nodes, Jenkins migration path exists, rails kit is extracted when 2+ nodes exist
assignees:
  - cogni-dev
created: 2026-02-07
updated: 2026-02-07
labels:
  - ci-cd
  - deployment
---

# Reusable CI/CD Rails & Multi-Node Pipeline

> Source: NODE_CI_CD_CONTRACT.md Phases P1–P3

## Goal

Extract CI/CD workflows from monolithic `.github/workflows/ci.yaml` into reusable seams, then optionally into an external shared rails kit when multi-node deployment proves the need. Jenkins migration path exists for when GitHub Actions costs or Dolt CI/CD requirements demand it.

## Roadmap

### Crawl (P0): Document Current State

**Goal:** Classify all CI/CD files, document canonical commands.

| Deliverable                                              | Status | Est | Work Item |
| -------------------------------------------------------- | ------ | --- | --------- |
| Scan CI entrypoints and classify files                   | Done   | 1   | —         |
| Document canonical commands (`pnpm check`, `check:full`) | Done   | 1   | —         |
| Classify portable vs node-owned files                    | Done   | 1   | —         |

### Walk (P1): In-Repo Reusable Workflow Seam

**Goal:** Thin caller → reusable impl. Updates to `_rails-node-ci.yml` propagate to all callers immediately.

**Gate:** Only proceed if Node #2 planned within 30 days OR CI drift pain exists.

| Deliverable                                                                 | Status      | Est | Work Item |
| --------------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `.github/workflows/_rails-node-ci.yml` with `on: workflow_call`      | Not Started | 1   | —         |
| Move static job steps (checkout, setup-node, pnpm install, typecheck, lint) | Not Started | 1   | —         |
| Move unit job steps (format, tests, coverage upload)                        | Not Started | 1   | —         |
| Move integration job steps (test:int)                                       | Not Started | 1   | —         |
| Convert `ci.yaml` to thin caller                                            | Not Started | 1   | —         |
| Verify: same commands, same order, same pass/fail behavior                  | Not Started | 1   | —         |

### Run (P2): Jenkins Migration

**Goal:** Full OSS CI/CD pipeline for Dolt CI/CD and cost control.

**Gate:** Paid customer exists OR GitHub Actions costs become prohibitive.

| Deliverable                                           | Status      | Est | Work Item |
| ----------------------------------------------------- | ----------- | --- | --------- |
| Create `Jenkinsfile` declarative pipeline             | Not Started | 2   | —         |
| Create Jenkins shared library from workflow logic     | Not Started | 2   | —         |
| Replace GHCR with generic container registry          | Not Started | 1   | —         |
| Replace GitHub secrets with Vault/generic secrets mgr | Not Started | 2   | —         |
| Deprecate GitHub Actions workflows                    | Not Started | 1   | —         |

### P3: External Rails Kit Repo

**Goal:** Shared reusable workflows across 2+ nodes, version-pinned.

**Gate:** 2+ nodes exist AND workflow drift maintenance burden proven.

**Sovereignty safeguards:** External rails are opt-in, version-pinned (prefer commit SHA). Node MUST retain vendored fallback. Upgrades only via explicit bump.

| Deliverable                                                        | Status      | Est | Work Item |
| ------------------------------------------------------------------ | ----------- | --- | --------- |
| Extract `_rails-node-ci.yml` to `cogni-rails` repo                 | Not Started | 2   | —         |
| Extract composite actions (`loki-ci-telemetry`, `loki-push`)       | Not Started | 1   | —         |
| Extract `platform/ci/scripts/` portable scripts                    | Not Started | 1   | —         |
| Nodes pin to versioned refs                                        | Not Started | 1   | —         |
| Do NOT extract lint/depcruise/prettier configs (node-owned policy) | Not Started | 0   | —         |

## Constraints

- **FORK_FREEDOM**: CI runs without secrets; CD is gated and skippable on forks
- **POLICY_STAYS_LOCAL**: ESLint/depcruise/prettier/tsconfig never centralized — rails kit provides orchestration, not policy
- **NO_RUNTIME_FETCHES**: Workflows never fetch config from outside repo
- **SCRIPTS_ARE_THE_API**: Workflows orchestrate by calling named pnpm scripts; no inline command duplication

## Dependencies

- [ ] Node #2 planned (gate for P1)
- [ ] Dolt CI/CD requirements defined (gate for P2)
- [ ] 2+ nodes with workflow drift pain (gate for P3)

## As-Built Specs

- [node-ci-cd-contract.md](../../docs/spec/node-ci-cd-contract.md) — CI/CD invariants, merge gate, file classification

## Design Notes

**Why Jenkins is an option:** Dolt CI/CD requires persistent state, branch-aware pipelines, and merge conflict resolution that GitHub Actions cannot provide. Jenkins is fully OSS, self-hosted, and portable. Migration is gated until Dolt integration begins.

**Why policy stays node-owned:** Centralizing lint/depcruise configs causes fork friction, policy fights, and loss of sovereignty. Rails kit provides orchestration defaults, not policy mandates.
