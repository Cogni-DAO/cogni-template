# CI/CD Pipeline Flow

## Overview

Automated staging→release→main workflow with fork-safe CI/CD and E2E-triggered promotions.

## Branch Model

- **Feature branches** → `staging` (via PR)
- **staging** → `release/YYYYMMDD-<shortsha>` (automated after E2E success)
- **release/\*** → `main` (via PR, manual approval)
- **main** → production (manual deploy via workflow_dispatch)

## Workflow Details

### 1. Feature Development

```
feature/xyz → staging (PR with full CI checks)
```

- Triggers: `ci.yaml` (lint, test, build)
- Merge requires: approval + green CI

### 2. Staging Preview Pipeline

```
push to staging → staging-preview.yml
```

**Jobs:** `build → push → deploy → e2e → promote`

- Builds & pushes preview image to GHCR
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
push to main → build-prod.yml → manual deploy-production.yml
```

- Auto-builds immutable `prod-<sha>` image
- Manual production deployment via workflow_dispatch

## Key Features

- **Fork-safe:** No secrets in PR CI checks
- **SHA-pinned:** Release branches locked to tested commits
- **Automated:** E2E success triggers promotion
- **Enforced:** Workflow prevents bypass of staging gate
- **Rollback-ready:** Any prod image can be redeployed
