# Contributing Flow: Core Implementation Tasks

**Target:** Automated `staging → main` promotion after successful E2E testing

---

## Task 1: Unified CI Workflow

**Problem:** Multiple CI workflows, inconsistent naming
**Solution:** Single `.github/workflows/ci.yml`

```yaml
on:
  pull_request:
    branches: [staging, main]

jobs:
  ci_staging:
    if: github.base_ref == 'staging'
    # Full CI: lint, test, build

  ci_main:
    if: github.base_ref == 'main'
    # Fast sanity checks only
```

---

## Task 2: Auto-PR Creation

**Problem:** Manual staging→main PR creation
**Solution:** `.github/workflows/staging-to-main-pr.yml`

```yaml
on:
  workflow_run:
    workflows: ["E2E Test Preview"]
    types: [completed]
    branches: [staging]

# Only create/update PR when E2E succeeds
if: github.event.workflow_run.conclusion == 'success'
# Use peter-evans/create-pull-request
```

---

## Task 3: Rename Current Workflows

**Problem:** Inconsistent workflow names for status checks
**Solution:**

- Rename `deploy-preview.yml` → `staging-preview.yml`
- Rename `e2e-test-preview.yml` → `e2e-preview.yml`
- Ensure consistent naming for branch protection

---

## Task 4: Create Staging Branch

**Problem:** No staging branch exists
**Solution:**

```bash
git checkout main
git checkout -b staging
git push -u origin staging
```

---

## Task 5: Branch Source Enforcement

**Problem:** Nothing prevents non-staging PRs to main
**Solution:** `.github/workflows/enforce-main-source.yml`

```yaml
on:
  pull_request:
    branches: [main]

jobs:
  enforce-main-source:
    runs-on: ubuntu-latest
    steps:
      - name: Enforce staging as source for main
        run: |
          if [ "${{ github.head_ref }}" != "staging" ]; then
            echo "Only staging is allowed to open PRs into main."
            exit 1
          fi
          echo "Source branch is staging; OK."
```

## Task 6: Auto-Merge Bot

**Problem:** Manual merge of staging→main PR
**Solution:** Configure `palantir/bulldozer`

```yaml
# .github/bulldozer.yml
version: 1
merge:
  whitelist:
    labels: ["auto-promote"]
  required_statuses:
    - "ci"
    - "staging-preview"
```

---

**Definition of Done:** E2E success on staging automatically creates/updates staging→main PR, which auto-merges when all checks pass.
