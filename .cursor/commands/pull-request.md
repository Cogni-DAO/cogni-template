Goal: Produce a Conventional Commit PR title and a concise, factual PR summary for this branch. Assume MVP quality unless evidence exists otherwise.

Hard rules:

- Title MUST follow Conventional Commits: `type(scope): subject` (≤72 chars, imperative). Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert. Scope = primary affected area (e.g., app, features, core, ports, adapters, infra, docs).
- If changes are disjoint or span multiple unrelated scopes, STOP and output: `SPLIT_REQUIRED: <brief reason>`.
- No hype or claims you cannot verify directly in diffs/tests.
- If you lack evidence for "Risk/Impact" or "Rollout," leave HTML comments with TODOs.

Process:

1. Enumerate diffs:
   - Get changed files and hunks (`git diff --name-status origin/main...HEAD` and `git diff`).
   - Read touched code and docs to understand what actually changed (imports, exports, behavior, configs, tests).

2. Cohesion check:
   - Confirm a single coherent purpose and a single dominant scope. If not coherent → `SPLIT_REQUIRED`.

3. Title:
   - Derive a single Conventional Commit title reflecting the dominant change.
   - If breaking change is clear, add a `BREAKING CHANGE:` footer in the summary.

4. Summary:
   - Use the template below. Describe only what you can point to in the diff. No speculation.

Template to output:

Title: <type(scope): subject>

## Context

Why this change exists, based only on code/comments/issue links in the diff. If unclear, write: <!-- Context: needs clarification -->

## Change

Bullet the observable modifications (APIs, functions, files, configs). No promises.

## Risk & Impact

User-facing or operational impact. List modules touched. If unknown: <!-- Risk: needs verification -->

## Rollout / Backout

Minimal, concrete steps. If unknown: <!-- Rollout: needs definition --> / <!-- Backout: revert PR -->

## Evidence

- CI: <!-- CI run link or 'pending' -->
- Screenshots/Logs: <!-- add only if present -->
- Manual validation: <!-- steps or 'not performed' -->

Footers (if any)

- BREAKING CHANGE: <impact and required migration>
- Refs: <#issue>
