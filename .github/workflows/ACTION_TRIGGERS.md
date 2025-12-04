# GitHub Actions Trigger Model (Sanity Guide)

This repo relies heavily on CI/CD. This doc is the bare-minimum model you need in your head when editing workflows.

---

## 1. Checks belong to commits, not PRs

- Every workflow run produces **checks for a specific commit SHA**.
- PR pages just aggregate “all checks that exist for this head SHA”.
- A check can appear on:
  - A branch (in the commits list)
  - Multiple PRs (if they share the same head SHA)

PRs **do not own** checks; commits do.

---

## 2. `push` vs `pull_request`

### `on: push`

- Fired when a commit is pushed to a branch that matches the filter.
- Example:

  ```yaml
  on:
    push:
      branches: [staging, main]
  ```

**Typical uses:**

- Run CI on protected branches (staging, main).
- Satisfy branch protection checks even if no PR event fired (e.g. bot-created release PRs).

### `on: pull_request`

- Fired when a PR event happens (opened, synchronize, reopened, etc.).
- The target branch must match the filter.
- Example:

  ```yaml
  on:
    pull_request:
      branches: [staging, main]
  ```

**Typical uses:**

- Run CI on feature/fork branches before merge.
- Enforce checks on PRs to staging / main.

---

## 3. Required checks and names

Branch protection uses check run names (format: **Workflow name / job name**), e.g.:

- `CI / ci`
- `CI / test-api`
- `block-non-release`

If you rename workflows or jobs, you must update required checks in:
**Settings → Branches → Branch protection rules → Required status checks.**

Stale names will sit as "Expected — waiting for status to be reported" forever.

---

## 4. Our CI trigger policy

**We want:**

- CI on all PRs (including forks).
- CI on pushes to staging and main (so release/promote flows are covered).
- No insane duplication.

**Current standard for CI.yml:**

```yaml
on:
  push:
    branches: [staging, main]
  pull_request:
    # default = all branches; PRs into any target branch
```

**Behavior:**

- Feature/fork PR → pull_request runs CI.
- Merge to staging → push runs CI on the merge commit.
- Promote/release to main → push runs CI on the main commit, even if the release PR didn't fire a pull_request event.
- concurrency in the workflow cancels redundant runs for the same ref when you push new commits.

**We accept:**

1. 1 run on the feature PR,
2. 1 run on the staging merge,
3. 1 run on the main merge.

That's normal for serious CI/CD.

---

## Summary

For your second question: **yes**, your CI trigger should be updated to:

```yaml
on:
  push:
    branches: [staging, main]
  pull_request:
```

**That gives you:**

- CI on all PRs (no branch filter = all).
- CI on pushes to staging and main (so release/promote flows are covered even when PR events are weird).
- Limited duplication: different branches, different contexts; concurrency already cancels old runs for the same ref.
