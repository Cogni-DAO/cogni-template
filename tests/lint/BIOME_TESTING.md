# Biome Policy Integration Tests

This document outlines the test coverage for our Biome linter integration, which mirrors ESLint test patterns with 1:1 parity enforcement.

## Migration Strategy

Biome tests follow a **frozen migration queue** pattern:

- All ESLint test spec files are copied to `tests/lint/biome/` with `describe.skip`
- Tests remain skipped until their corresponding rule is migrated from ESLint → Biome
- When a rule migrates (per `docs/LINTING_RULES.md` commit plan), we:
  1. Unskip the Biome test
  2. Update it to use Biome diagnostics (`lint/style/noDefaultExport` vs `import/no-default-export`)
  3. Ensure it passes
  4. Remove/disable the ESLint twin for that rule

## Test Infrastructure

### runBiome.ts Helper

The `runBiome.ts` test harness provides:

- **Virtual path support**: `lintFixture(fixturePath, code?, { virtualRepoPath?: string })`
  - Reads fixture content from `tests/lint/fixtures/`
  - Writes to a temporary file at `virtualRepoPath` in the repo
  - Runs `pnpm biome check --reporter json` against the temp file
  - Cleans up after test completes
  - Enables testing path-sensitive allowlists (e.g., `src/app/**/page.tsx`)

- **ESLint parity interface**: Returns same shape as `runEslint.ts`

  ```typescript
  {
    errors: number;
    warnings: number;
    messages: {
      ruleId: string | null;
      message: string;
      line: number;
    }
    [];
  }
  ```

- **Filtering options**: Supports `focusRulePrefixes` and `ignoreRules` for test isolation

### Fixture Reuse

- **No new fixtures**: Tests use existing fixtures from `tests/lint/fixtures/`
- **Fixture ignore**: `biome/base.json` disables linting for `tests/lint/fixtures/**` to prevent pollution
- **Virtual paths**: Use `virtualRepoPath` option to test fixtures at proper repo locations

## Current Coverage (Commit 2B: noDefaultExport)

### canary.spec.ts — Minimal Smoke Tests

**Implemented:**

- ✅ Flags default export in component files
  - Fixture: `classnames/fail_literal_string.tsx`
  - Expects: `lint/style/noDefaultExport` diagnostic

- ✅ Allows default export in App Router page files
  - Fixture: `app/fail_page_literal_classes.tsx`
  - Virtual path: `src/app/__biome_test__/page.tsx`
  - Expects: NO `lint/style/noDefaultExport` diagnostic

**Skipped (pending migration):**

- ⏭️ `process-env.spec.ts` (8 tests) — Waiting for Commit 3
- ⏭️ `type-imports.spec.ts` (13 tests) — Waiting for Commit 4
- ⏭️ `imports.spec.ts` (5 tests) — Waiting for Commit 5
- ⏭️ All boundary tests (16+ tests) — ESLint-only (no Biome equivalent)
- ⏭️ All UI governance tests (8 tests) — ESLint-only (custom plugin)

## Anti-Drift Safeguards

**Required meta-tests (TODO):**

1. **Unskip guard**: Fail if any Biome spec is NOT `describe.skip` and NOT listed as migrated in `docs/LINTING_RULES.md`
2. **Coverage parity**: Fail if `tests/lint/eslint/*.spec.ts` and `tests/lint/biome/*.spec.ts` filenames don't match 1:1

## Implementation Notes

- **Physical files required**: Biome CLI needs actual files on disk (no stdin for JSON reporter)
- **Temp file cleanup**: `runBiome.ts` cleans up test files in `finally` block
- **Path sensitivity**: Biome allowlists use strict globs (e.g., `src/app/**/page.tsx` requires exact filename)
- **Test execution**: Run via `pnpm test:lint` (includes both ESLint and Biome tests)

## Migration Checklist Per Rule

When migrating a rule from ESLint to Biome:

1. Enable rule in `biome/base.json` or relevant override config
2. Update `tests/lint/biome/<rule>.spec.ts`:
   - Change `describe.skip` to `describe`
   - Update `ruleId` assertions to Biome diagnostic categories
   - Verify test passes
3. Remove ESLint rule from `eslint/*.config.mjs`
4. Mark complete in `docs/LINTING_RULES.md`
5. Delete obsolete ESLint test if no longer needed

## Related Documentation

- [LINTING_RULES.md](../../docs/LINTING_RULES.md) - Migration roadmap and commit plan
- [ESLINT_TESTING.md](ESLINT_TESTING.md) - ESLint test patterns and coverage
- [canary.spec.ts](canary.spec.ts) - Reference Biome test implementation
