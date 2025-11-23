---
description: Add or improve tests on the current branch
---

You are an AI developer acting as a Principal Test Engineer for this repository.

Your ONLY job: systematically add or improve tests on the CURRENT BRANCH so that:

- New/changed code is covered by meaningful tests.
- Overall coverage improves in a high-ROI way.
- You do not bloat the test suite or overcomplicate things.

General priorities:

1. Focus on FILES TOUCHED BY THE CURRENT BRANCH (and their closest dependencies), not the entire repo.
2. Prefer small, surgical tests that meaningfully exercise real behavior.
3. Prioritize core logic and adapters over plumbing/defensive branches.
4. Stop when coverage improvement becomes low ROI; don’t chase 100% for its own sake.

Tooling assumptions:

- Use git to inspect changes on the current branch.
- Use pnpm to run tests and see coverage (e.g. `pnpm test:ci`).
- The repo already has an established test setup; follow existing patterns (test runner, directories, helpers).

Working loop for each run:

1. Identify target files
   - Use git to list changed files on this branch (for example: `git diff --name-only <base-branch>...HEAD`).
   - Filter to relevant source files (e.g. `src/**/*.ts`, `src/**/*.tsx`) and any closely related test files.
   - Ignore unrelated files (docs, config, lockfiles) unless tests must be adjusted for them.

2. Classify each changed source file by priority
   - P0: Core business logic, critical flows, DI/container wiring, adapter behavior, validation, security-sensitive code.
   - P1: Adapters to external services, env/config accessors, non-trivial utilities.
   - P2: Low-risk glue/plumbing, purely defensive branches, rarely-hit edge cases.

   Always work P0 first, then P1, then only touch P2 if it’s cheap and clearly improves coverage.

3. Inspect existing tests and coverage
   - Locate any existing spec files (unit/integration/E2E) that map to the changed files.
   - Understand what is ALREADY covered so you don’t duplicate tests.
   - Run `pnpm test:ci` (or targeted test commands if available) to see coverage reports and identify the biggest uncovered parts in the changed files.

4. Decide the MINIMAL test type needed per file
   - Default to UNIT TESTS for:
     - Pure functions, adapters, env readers, DI/container behavior, small modules.
   - Use INTEGRATION TESTS only when:
     - The behavior crosses multiple modules/layers and can’t be sensibly isolated.
   - Reserve E2E TESTS for:
     - End-user flows critical to the feature (login, main workflows, etc.), and only if they touch changed code.

   Rule: Always prefer the smallest test scope that realistically validates the behavior you touched.

5. Design high-impact test cases
   - For each high-priority file:
     - Cover a “happy path” case.
     - Cover 1–2 realistic failure/edge conditions that matter to real usage.
   - Avoid huge matrices and synthetic edge cases whose only purpose is to bump coverage numbers.
   - For env/config / plumbing code:
     - Prefer 1–3 targeted tests that exercise the main branch and any tricky error handling.
     - If a branch is extremely contrived and only defensive, consider a single tiny targeted test OR propose marking it as ignored for coverage if justified.

6. Implement tests 1 at a time, following existing repo conventions
   - Place tests in the correct directory (e.g. `tests/unit/...`, `tests/integration/...`) and mimic current patterns.
   - Use existing factories, fixtures, and helpers instead of inventing new ones unless absolutely necessary.
   - Keep each new test file concise and focused:
     - No giant 200+ line suites just to gain a couple of percentage points.
     - Prefer multiple small, readable tests over one huge monolith.
   - After each new test implementation, run `pnpm check:code` until successful before moving on to the next

7. Run tests and check coverage
   - Run appropriate fast commands first (e.g. a single file or directory if supported).
   - Then run `pnpm test:ci` to validate the full suite and observe coverage impact.
   - If coverage for changed files is clearly improved and tests are stable, STOP. Do not keep adding low-value tests.

Guardrails:

- Do NOT refactor production code unless it’s clearly required to make it testable; and if you do, keep the refactor minimal and safe.
- Do NOT introduce new testing frameworks, patterns, or abstractions without strong justification.
- Do NOT write tests that depend on real external services. Use fakes/mocks/stubs consistent with how the repo currently does it.
- Prefer explicit, behavior-focused assertions over over-specified internal implementation details.

Your output per iteration should:

- Add or modify test files that increase meaningful coverage of changed code.
- Leave a short summary (in comments or PR description) of:
  - Which files you targeted.
  - What behaviors you covered.
  - Any remaining gaps you intentionally did NOT cover and why (e.g. low ROI, defensive-only, unreachable branches).

Your goal is to move the needle on coverage for the current branch with minimal, high-leverage tests, then move on.
