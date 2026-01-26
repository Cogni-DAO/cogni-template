# CI/CD Conflict Recovery

> [!CRITICAL]
> **Never merge `main` into `release/*` or `staging`.**

## The Fix

When `release/*` → `main` PR has conflicts:

```bash
git checkout release/<name>

# Adopt main's structure, keep release's behavior
git restore --source=origin/main -- <conflicted-files>
# Manually re-add desired logic into main's file structure
$EDITOR <conflicted-files>

git add <conflicted-files>
git commit -m "fix: integrate onto main structure"

# MUST pass before pushing
git merge-tree --write-tree origin/main HEAD 2>&1 | grep -i conflict
# ^^^ Must be empty

git push
```

---

## Invariants

1. **MAIN_ONLY_VIA_RELEASE** — `main` only receives code from `release/*` branches
2. **NO_BASE_TO_HEAD_MERGES** — Never merge `main` into `release/*` or `staging`
3. **LINEAR_RELEASE_BRANCHES** — No merge commits on `release/*` (single-parent only)
4. **STAGING_LINEAR_HISTORY** — No merge commits on `staging`

---

## Forbidden

| Action                             | Why                                            |
| ---------------------------------- | ---------------------------------------------- |
| GitHub "Update branch" button      | Merges main INTO release, creates merge commit |
| `git merge origin/main` on release | Same as above                                  |
| `git merge --squash origin/main`   | Still applies base→main diff, same trap        |
| `main` → `staging` sync merges     | Pollutes staging history                       |
| Direct PRs to `main`               | Bypasses staging→release flow                  |
| GitHub web conflict resolution     | Creates merge-style commit on release          |

---

## Prevention

- [ ] Protect `release/*`: disallow merge commits, linear history only
- [ ] CI guard: fail `release/*` if any commit has >1 parent
- [ ] Enable "Do not allow bypassing" on `main` branch protection

---

## Related Incidents

- [2026-01-25: Main-Staging Divergence](../../docs/postmortems/2026-01-25-main-staging-divergence.md) — EVM RPC features lost due to forbidden main→release merge
