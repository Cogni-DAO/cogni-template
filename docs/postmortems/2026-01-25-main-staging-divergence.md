# Postmortem: Main-Staging Divergence (EVM RPC Feature Loss)

**Date**: 2026-01-25
**Severity**: High (blocked releases for 4+ days)
**Status**: Resolved
**Related**: [CI/CD Conflict Recovery Runbook](../../platform/runbooks/CICD_CONFLICT_RECOVERY.md)

---

## Summary

Release branches from staging consistently failed to merge to main due to conflicts in `src/shared/env/invariants.ts` and `src/app/(infra)/readyz/route.ts`. Investigation revealed that main was missing 125 lines of code (EVM RPC validation features) that existed on staging since Dec 11, 2025.

---

## Root Cause

### The Forbidden Merge

**Commit**: `5a047cd`
**Message**: `Merge branch 'main' into release/20251211-4f1c3b49`
**Author**: Derek
**Date**: 2025-12-11 18:28:20 +0800

Someone 👀 merged `main` INTO the release branch, violating invariant **NO_BASE_TO_HEAD_MERGES**.

#### State at time of forbidden merge:

| Branch                                   | `invariants.ts` | Content                    |
| ---------------------------------------- | --------------- | -------------------------- |
| Release before (`4f1c3b49`)              | 149 lines       | EVM RPC validation present |
| Main at time (`76c4b9d`)                 | 80 lines        | Basic structure only       |
| **After main→release merge (`5a047cd`)** | **80 lines**    | **EVM RPC deleted**        |

The merge brought main's 80-line version into the release branch, overwriting the EVM RPC features.

### Then the corrupted release was merged to main:

**Commit**: `eb1fb92` — PR #192
**Message**: `feat(security): on-chain payment verification, remove API key db storage, standard /livez and /readyz probes`
**Date**: 2025-12-11 18:34:18 +0800

This brought the corrupted 80-line file to main, where it persisted through all subsequent merges.

---

## Timeline

| Date                    | Event                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| 2025-12-11 02:24        | PR #189 merged to main: Created `invariants.ts` with 80 lines     |
| 2025-12-11 04:23        | PR #190 merged to staging: Added EVM RPC (149 lines)              |
| **2025-12-11 18:28**    | **`5a047cd`: Forbidden merge of main INTO release**               |
| 2025-12-11 18:34        | `eb1fb92` (PR #192): Corrupted release merged to main             |
| 2025-12-11 → 2026-01-24 | All subsequent release→main merges propagated the 80-line version |
| 2026-01-24              | PR #268, #269, #270 blocked by conflicts                          |
| 2026-01-25              | Root cause identified, manual merge with correct resolution       |

---

## Why Subsequent Merges Didn't Fix It

Once main had the 80-line version and staging continued with 149 lines, every merge followed this pattern:

1. Merge-base: 149 lines (common ancestor on staging)
2. Main: 80 lines (deleted 69 lines from merge-base)
3. Release: 149 lines (no change from merge-base)

Git's three-way merge sees: _main deleted lines, release didn't change them → take main's deletion_

This is **correct merge behavior**. The deletion was intentional from Git's perspective because it was committed on the main lineage.

---

## Impact

- **44 days** of divergence (Dec 11, 2025 → Jan 25, 2026)
- **4+ days** of blocked releases during investigation
- **3 failed PRs** (#268, #269, #270)
- Required **manual override** of branch protection to resolve

---

## Resolution

1. Disabled `require-pinned-release-branch` check temporarily
2. Performed conflict resolution in GitHub UI with correct content (release's version)
3. Merged PR #270 with "Create a merge commit"
4. Re-enabled branch protections

---

## Lessons Learned

### What Went Wrong

1. **Forbidden operation executed**: `git merge main` was run on a release branch
2. **Wrong conflict resolution**: When merging main into release, main's version was chosen
3. **No automated detection**: CI passed because the code was syntactically valid

### Why It Likely Happened

The release branch had conflicts with main. Instead of following the correct procedure (fix on release without merging main), the developer used GitHub's "Update branch" button or ran `git merge main`. This is exactly what the invariants forbid.

### What Went Right

1. `require-pinned-release-branch` prevented silent corruption of release branches (added after this incident's root cause)
2. CI caught syntax errors from bad manual resolutions
3. Linear history policies made the bad merge traceable

---

## Action Items

| Priority | Action                                                                 | Status                |
| -------- | ---------------------------------------------------------------------- | --------------------- |
| P0       | Document: Never use "Update branch" button on release PRs              | **DONE** (in runbook) |
| P0       | Add CI check: fail if release/\* branch has merge commits              | TODO                  |
| P1       | Add CI check: fail if release→main merge loses lines                   | TODO                  |
| P1       | Audit GitHub branch protection: disable "Update branch" for release/\* | TODO                  |

---

## Appendix: Key Commits

```
5a047cd  2025-12-11 18:28  Merge branch 'main' into release/20251211-4f1c3b49  ← ROOT CAUSE
eb1fb92  2025-12-11 18:34  feat(security): on-chain payment verification (#192)  ← Propagated to main
76c4b9d  2025-12-11 02:24  fix: virtual key exposure removal (#189)  ← Created 80-line file
bdf7cb4  2025-12-11 04:23  feat(payments): add EVM RPC verification (#190)  ← Added EVM RPC (staging only)
```

### Verification Commands

```bash
# Show the forbidden merge
git show 5a047cd --format="%s%nParents: %P" --no-patch
# Merge branch 'main' into release/20251211-4f1c3b49
# Parents: 4f1c3b49 76c4b9d

# Show file state corruption
git show 4f1c3b49:src/shared/env/invariants.ts | wc -l  # 149 (before)
git show 5a047cd:src/shared/env/invariants.ts | wc -l   # 80 (after - WRONG)
```
