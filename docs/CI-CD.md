# CI/CD Pipeline Flow

## Overview

Automated staging→release→main workflow with fork-safe CI/CD and E2E-triggered promotions.

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
- Tests container health (startup + health endpoint with hardcoded test env)
- Pushes validated image to GHCR
- Deploys to preview environment
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
