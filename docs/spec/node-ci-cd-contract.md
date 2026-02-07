---
id: spec.node-ci-cd-contract
type: spec
title: Node CI/CD Contract
status: draft
spec_state: draft
trust: draft
summary: CI/CD sovereignty invariants, merge gate checks, workflow entrypoints, and file ownership classification
read_when: Modifying CI workflows, adding checks to merge gate, or planning multi-node CI extraction
implements: []
owner: cogni-dev
created: 2025-12-22
verified: null
tags:
  - ci-cd
  - deployment
---

# Node CI/CD Contract

## Context

Node sovereignty is non-negotiable. CI must run from repo with zero operator dependencies. This spec defines what checks are required, which files are node-owned vs rails-eligible, and the ownership split between orchestration and policy.

## Goal

Define the CI/CD invariants, merge gate, and file ownership boundaries that ensure every node can run its full pipeline independently.

## Non-Goals

- Reusable workflow extraction (see [ini.ci-cd-reusable](../../work/initiatives/ini.ci-cd-reusable.md))
- Jenkins migration (see initiative P2)
- External rails kit (see initiative P3)

---

## Core Invariants

1. **FORK_FREEDOM**: CI runs without secrets; CD (build/deploy) is gated and skippable on forks.

2. **POLICY_STAYS_LOCAL**: ESLint/depcruise/prettier/tsconfig never centralized.

3. **LOCAL_GATE_PARITY**: `pnpm check` runs same assertions as CI, different execution (sequential vs parallel).

4. **NO_RUNTIME_FETCHES**: Workflows never fetch config from outside repo.

5. **SCRIPTS_ARE_THE_API**: Workflows orchestrate by calling named pnpm scripts; no inline command duplication.

---

## Design

### Merge Gate (Required for PR Merge)

| Check                               | Local | CI              |
| ----------------------------------- | ----- | --------------- |
| `pnpm typecheck`                    | yes   | static job      |
| `pnpm lint`                         | yes   | static job      |
| `pnpm format:check`                 | yes   | unit job        |
| `pnpm test:ci` (unit/contract/meta) | yes   | unit job        |
| `pnpm arch:check`                   | yes   | static job      |
| `pnpm test:int`                     | yes   | integration job |

**Optional** (not blocking): `pnpm test:stack:docker`, e2e, coverage upload.

### Update Flow (Current State)

No shared kit. Each node owns its workflows directly. `ci.yaml` runs the same checks as `pnpm check` but parallelized across jobs.

### Workflow Entrypoints

| File                                      | Type | Secrets | Trigger               | Commands                                               |
| ----------------------------------------- | ---- | ------- | --------------------- | ------------------------------------------------------ |
| `.github/workflows/ci.yaml`               | CI   | No      | PR, push staging/main | typecheck, lint, format, test:ci, test:int, arch:check |
| `.github/workflows/build-prod.yml`        | CD   | Yes     | push main             | build.sh, test-image.sh, push.sh                       |
| `.github/workflows/staging-preview.yml`   | CD   | Yes     | push staging          | pnpm check, build.sh, deploy.sh, e2e                   |
| `.github/workflows/deploy-production.yml` | CD   | Yes     | workflow_run          | deploy.sh                                              |

### Local Gates

| Command           | Script                  | Purpose                                                                 |
| ----------------- | ----------------------- | ----------------------------------------------------------------------- |
| `pnpm check`      | `scripts/check-fast.sh` | Fast gate: typecheck + lint + format + unit/contract/meta + docs + arch |
| `pnpm check:full` | `scripts/check-full.sh` | CI parity: Docker build + stack + all test suites                       |

### File Ownership Classification

**Node-Owned (Never Centralize):**

| Path                           | Why                         |
| ------------------------------ | --------------------------- |
| `.dependency-cruiser.cjs`      | Hex architecture boundaries |
| `eslint.config.mjs`, `eslint/` | UI/chain governance rules   |
| `biome.json`, `biome/`         | Lint rules                  |
| `.prettierrc`                  | Formatting                  |
| `tsconfig*.json`               | Path aliases                |
| `scripts/check-*.sh`           | Local gate definitions      |
| `Dockerfile`                   | Image definition            |

**Rails-Eligible (future extraction candidates):**

| Path                                 | Purpose              |
| ------------------------------------ | -------------------- |
| `.github/actions/loki-ci-telemetry/` | CI telemetry capture |
| `.github/actions/loki-push/`         | Loki push            |
| `platform/ci/scripts/build.sh`       | Docker build         |
| `platform/ci/scripts/push.sh`        | GHCR push            |
| `platform/ci/scripts/test-image.sh`  | Image liveness test  |

**Ownership split:** Nodes own scripts and policy configs. Kit owns invocation conventions (when to call, how to parallelize, what to cache).

### Key Decisions

#### 1. Why Jenkins Is an Option

| Concern        | GitHub Actions     | Jenkins      |
| -------------- | ------------------ | ------------ |
| OSS            | Proprietary runner | Fully OSS    |
| Self-host      | Limited            | Full control |
| Cost at scale  | Per-minute billing | Own infra    |
| Vendor lock-in | GitHub-specific    | Portable     |

Key driver: Dolt CI/CD requires persistent state, branch-aware pipelines, and merge conflict resolution that GitHub Actions cannot provide.

#### 2. Why In-Repo Seam First

Extracting to external repo too early causes version pinning overhead, false abstraction boundaries, and reduced iteration speed.

#### 3. Why Policy Stays Node-Owned

Centralizing lint/depcruise configs causes fork friction, policy fights, and loss of sovereignty. Rails kit provides orchestration defaults, not policy mandates.

### File Pointers

| File                        | Purpose                          |
| --------------------------- | -------------------------------- |
| `.github/workflows/ci.yaml` | CI entrypoint                    |
| `scripts/check-fast.sh`     | `pnpm check` implementation      |
| `scripts/check-full.sh`     | `pnpm check:full` implementation |

## Acceptance Checks

**Automated:**

- `pnpm check` — local gate parity with CI
- Fork PRs pass CI without secrets

**Manual:**

1. Verify `.github/workflows/ci.yaml` calls only pnpm scripts (no inline commands)
2. Verify CD workflows skip gracefully when secrets are missing (fork mode)

## Open Questions

_(none)_

## Related

- [ci-cd.md](./ci-cd.md) — CI/CD specification
- [check-full.md](./check-full.md) — check:full CI-parity gate
- [Initiative: Reusable CI/CD Rails](../../work/initiatives/ini.ci-cd-reusable.md)
