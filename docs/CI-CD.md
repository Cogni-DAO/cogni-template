# CI/CD Pipeline Flow

## Overview

Automated staging→release→main workflow with fork-safe CI/CD and E2E-triggered promotions.

## Critical TODOs

**P0 - Production Reliability**:

- [ ] **Post-deploy verification and rollback**: Add automated smoke tests to `deploy-production.yml` after deploy completes; on failure, automatically redeploy last known-good `prod-<sha>` and mark bad release as blocked. Current state: green pipeline means "deploy finished", not "prod is healthy".
- [ ] **Image scanning and signing**: Integrate container scanning into `build-prod.yml` (fail on high/critical CVEs) and sign images (cosign or equivalent); `deploy-production.yml` must refuse unsigned/unverified images.

**P1 - Optimization and Maintainability**:

- [ ] **Edge routing CI validation**: Add CI job that starts full stack (including SourceCred) and validates edge Caddyfile routes via smoke tests: `/health`, `/api/v1/public/*`, `/sourcecred/`. Prevents edge config drift from breaking local/CI.
- [ ] **Config as code validation**: Enforce env schema validation in CI (type-check + required keys), block deploy if invalid, surface staging/prod config diffs during release promotion.
- [ ] **Refactor `deploy.sh`**: Split 600+ line monolith into composable modules (edge, runtime, sourcecred, cleanup functions).
- [ ] **Complete migrator fingerprinting**:
  - [x] `compute_migrator_fingerprint.sh`: Generates stable 12-char content hash
  - [x] `ci.yaml` (stack-test): Pull by fingerprint, build only if missing
  - [x] `build-prod.yml`: Compute fingerprint, dual-tag and push migrator
  - [ ] `staging-preview.yml`: Add fingerprint computation and dual tagging
  - [ ] `deploy-production.yml`: Compute fingerprint, pass to deploy.sh
  - [ ] `deploy.sh`: Pull `migrate-${FINGERPRINT}` instead of coupled tag
  - [ ] Remove legacy coupled `-migrate` tags after all envs use fingerprints
  - [ ] `build.sh`/`push.sh`: Optionally skip build/push if fingerprint exists remotely

**Non-goals** (defer until needed):

- Per-PR ephemeral environments for every feature branch (not mission-critical at current scale)
- Full blue/green or traffic-split canaries (staging+release gating sufficient for now)

---

## Branch Model

- **Feature branches** (`feat/`, `fix/`, `chore/`, etc.) → `staging` (via PR)
- **staging** → `release/YYYYMMDD-<shortsha>` (automated after E2E success)
- **release/\*** → `main` (via PR, manual approval)
- **main** → production (manual deploy via workflow_dispatch)

```
feat/* → staging → release/* → main
```

**Key invariant**: `main` receives code only via `release/*` branches, never direct commits or non-release PRs.

## Workflow Details

### 1. Feature Development

```
feat/xyz → staging (PR with full CI checks)
fix/abc → staging (PR with full CI checks)
```

- Triggers: `ci.yaml` (contains `pnpm check`, `docker-compose.dev build`, `test:stack:docker`)
- Branch types: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`
- Merge requires: approval + green CI

### 2. Staging Preview Pipeline

```
push to staging → staging-preview.yml
```

**Jobs:** `build → test-image → push → deploy → e2e → promote`

- Builds Docker image
- Tests liveness (/livez gate with minimal env, pre-push validation)
- Pushes validated image to GHCR
- Deploys to preview environment (readiness hard-gate on /readyz)
- Runs full Playwright E2E tests
- **If E2E passes:** auto-creates release branch + PR to main

### 3. Release Promotion

```
release/YYYYMMDD-<shortsha> → main (PR)
```

- Triggers: `ci.yaml` (fast sanity checks)
- **Enforced:** Only `release/*` branches can PR to main
- Merge requires: approval + green CI

### 4. Production Deploy

```
push to main → build-prod.yml (build → test → push) → deploy-production.yml (triggers on success only)
```

- Auto-builds immutable `prod-<sha>` image
- Tests container health before push (hardcoded test environment)
- Deploy workflow triggers only on build success
- Rolling deployment (no downtime)

## Key Features

- **Fork-safe:** No secrets in PR CI checks
- **SHA-pinned:** Release branches locked to tested commits via `${GITHUB_SHA}`
- **SHA-enforced:** CI prevents modification of release branches after promotion
- **Automated:** E2E success triggers promotion
- **Enforced:** Workflow prevents bypass of staging gate
- **Rollback-ready:** Any prod image can be redeployed
- **History preservation:** Feature branches auto-archived as tags after merge

## TypeScript Package Build Strategy

**Rule**: If a step imports `@cogni/*` packages, run `pnpm packages:build` first.

**Applies to**:

- CI jobs running typecheck/tests
- Dockerfile before `next build`

**Canonical command**: `pnpm packages:build` runs tsup (JS), tsc -b (declarations), and validation atomically. Same command in local dev, CI, and Docker.

**Current**: Each context builds independently (~1-2s overhead). Future: Turborepo remote caching when scale justifies complexity.

## Image Tagging Strategy

**App images**: Commit-based

- `prod-${GITHUB_SHA}` or `preview-${GITHUB_SHA}`

**Migrator images**: Dual-tagged for backward compatibility during transition

- `prod-${GITHUB_SHA}-migrate` (deploy consumption, legacy)
- `migrate-${FINGERPRINT}` (content-addressed, CI caching - partial implementation)

**Service images** (see [CI/CD Services Roadmap](CICD_SERVICES_ROADMAP.md)):

- `prod-${GITHUB_SHA}-${SERVICE}` (e.g., `prod-abc123-scheduler-worker`)
- Future: Content fingerprinting like migrator

**SourceCred** (manual image release, auto-deployed via deploy.sh):

- Immutable image: `ghcr.io/cogni-dao/cogni-sourcecred-runner:sc0.11.2-node18-2025-12-07`
- Image built from Dockerfile with `CMD ["yarn", "start"]` (invokes sourcecred via node_modules)
- Deployed automatically during `deploy.sh` runs (not gated by app build workflow)
- Image release process: `platform/infra/services/sourcecred/release.sh`
- Version: v0 (prototype)
- Long-term: Planned deprecation

## Branch Management

### Auto-cleanup

- **Setting:** "Automatically delete head branches" enabled in repo settings
- **Result:** Feature branches deleted after PR merge to prevent accumulation

### History archival

- **Trigger:** `archive-feature-history.yml` runs on merged `feat/*` and `fix/*` PRs
- **Archive format:** `archive/pr-{number}-{safe-branch-name}` tags
- **Purpose:** Preserve full incremental commit history for AI training and debugging
- **Expandable:** Can be extended to include `chore/*`, `docs/*`, etc. as needed

## Branch Configuration Settings

### Repository-wide Settings

**Settings → General → Pull Requests:**

- Enable: "Allow squash merging"
- Enable: "Allow merge commits"
- Enable: "Automatically delete head branches"
- Disable: "Allow rebase merging"

### Branch Protection: staging

**Settings → Branches → staging:**

- Require pull request before merging
- Require status checks to pass: `ci`
- Require linear history (enforces squash merge)
- Optional: Restrict pushes to admins only

### Branch Protection: main

**Settings → Branches → main:**

- Require pull request before merging
- Require status checks to pass:
  - `ci`
  - `require-pinned-release-branch` (prevents modified release branches)
- DO NOT require linear history (allows merge commits from release/\*)
- DO NOT require branches to be up to date (release/\* branches are clean snapshots)
- Optional: Restrict pushes to admins only

### Workflow Enforcement

- `require-pinned-release-prs-to-main.yml` ensures only `release/*` branches can target main AND that release branches match their tested SHA suffix

---

## Related Documentation

- [Application Architecture](ARCHITECTURE.md) - Hexagonal design and code organization
- [Deployment Architecture](../platform/runbooks/DEPLOYMENT_ARCHITECTURE.md) - Infrastructure and deployment details
- [CI/CD Services Roadmap](CICD_SERVICES_ROADMAP.md) - Service build/deploy integration plan (GitOps migration)
- [CI/CD Conflict Recovery](../platform/runbooks/CICD_CONFLICT_RECOVERY.md) - How to resolve release→main conflicts without polluting history
