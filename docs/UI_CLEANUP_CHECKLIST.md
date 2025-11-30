# UI Cleanup Checklist

**Context**: See [UI_CLEANUP_PLAN.md](UI_CLEANUP_PLAN.md) for full cleanup strategy.
**Scope**: Phases 0-3 only (freeze → delete → consolidate). Phase 4 (Storybook/Playwright) deferred.

---

## Scan Results Summary

**Component inventory**: 26 kit + 7 feature components (no duplicates)
**Kit violations**: 7 (colors: 1, typography: 4, CVA: 2)
**Page soup violations**: 37 inline className strings across 4 files
**ESLint config bugs**: 5
**Mobile overflow risks**: 3

---

## Phase 0: Freeze

- [ ] Add ESLint rule: block new components outside `kit/` (line ~120 in `eslint/ui-governance.config.mjs`)
- [ ] Add ESLint rule: block new UI library imports (`@headlessui/*`, `react-aria/*`)
- [ ] Verify `no-raw-colors` rule is active

---

## Phase 2: Delete

- [x] Install Knip: `pnpm add -D knip`
- [x] Configure Knip scope: UI only (app/features/components/styles), ignore core/ports/adapters/tests
- [x] **Knip scope notes** (for future expansion):
  - Current: UI cleanup only (app/features/components/styles)
  - TODO: Expand to cover core/ports/adapters/contracts/shared once UI cleanup is stable
  - TODO: Add minimal tests for intentional public APIs first to avoid false positives
  - TODO: Remove tests/e2e/scripts/platform ignores and add proper entry patterns
  - TODO: Re-evaluate ignoreDependencies once scope expands
- [ ] ~~Delete dead code~~ _SKIPPED - Knip scoped to UI only, no obvious UI dead code found_
- [x] Create `scripts/check-ui-tokens.sh` (typography + arbitrary value regex checks)
- [x] Wire into `scripts/check-all.sh`

---

## Phase 3: Consolidate

### 3.1 Token System

- [ ] Add `--success`, `--warning`, `--danger` HSL values to `src/styles/tailwind.css`
- [ ] Add `success`, `warning`, `danger` keys to `src/styles/theme.ts` → `statusKeys`

### 3.2 Kit Component Fixes

#### Alert.tsx (raw colors + typography)

- [ ] Line 30: Replace `border-green-500/50 bg-green-50 text-green-700...` → `border-success/50 bg-success/10 text-success`
- [ ] Line 22: Replace `text-sm` → `text-[var(--text-sm)]`

#### Input.tsx (CVA location + typography)

- [ ] Move `inputVariants` CVA definition to `src/styles/ui/inputs.ts`
- [ ] Export from factory, import in component
- [ ] Line 21: Replace `text-sm` → `text-[var(--text-sm)]`

#### GithubButton.tsx (CVA export + typography)

- [ ] Line 419: Remove `export { githubButtonVariants }`
- [ ] Lines 52-53: Replace `text-xs` and `text-sm` → token equivalents

### 3.3 Page Soup Fixes

#### CreditsPage.client.tsx (15 violations)

- [ ] Extract to `src/styles/ui/data.ts`: `ledgerGrid()`, `ledgerEntry()`, `ledgerRow()`, `statsBox()`
- [ ] Update component to use factories (lines 75, 87, 88, 104, 132, 136, 139, 165, 194, 208)

#### chat/Terminal.tsx (9 violations + mobile)

- [ ] Extract to `src/styles/ui/overlays.ts`: `chatContainer()`, `chatMessages()`, `chatMessage()`, `chatForm()`, `chatDivider()`
- [ ] Line 103: Change `overflow-y-auto p-4` → `overflow-y-scroll p-[var(--spacing-sm)] sm:p-[var(--spacing-md)]`
- [ ] Update component to use factories (lines 102, 103, 111, 121, 128, 134, 135, 141, 144)

#### HomeHeroSection.tsx (negative margins)

- [ ] Line 37: Add `mx-0` at base breakpoint to prevent mobile overflow
- [ ] Change `-mx-[var(--spacing-xl)] sm:-mx-[...]` → `mx-0 sm:-mx-[var(--spacing-xl)] md:-mx-[...]`

#### KpiBadge.tsx (4 inline CVA)

- [ ] Standardize CVA definitions with design tokens or move to `src/styles/ui/data.ts`

### 3.4 ESLint Config Bugs

- [ ] Bug #1 (line 57): `rounded-[--radius]` → `rounded-[var(--radius)]`
- [ ] Bug #2 (lines 124-156): Extract `BASE_RESTRICTED_IMPORTS`, spread into layer-specific patterns
- [ ] Bug #3 (line 290): `e2e/**/*.{ts,spec.ts}` → `e2e/**/*.ts`
- [ ] Bug #4 (lines 60-65): Remove `tailwindcss/prefer-theme-tokens` (overlaps custom rules)
- [ ] Bug #5 (lines 265-278): Narrow scope from `**/*.{ts,tsx}` → `src/app/**`, `src/components/**`, `src/features/**`

---

## Validation

- [ ] `pnpm check` passes (lint + type + format)
- [ ] `pnpm test` passes (unit + integration)
- [ ] `pnpm build` succeeds (production build)
- [ ] Manual: Open `localhost:3000` at 360px viewport (no horizontal scroll)
- [ ] Manual: Verify `/credits` page layout at 360px
- [ ] Manual: Verify `/chat` page scrolling at 360px
- [ ] Manual: Verify home page hero section at 360px

---

## Acceptance Criteria

- ✅ Zero raw color violations (including Alert success variant)
- ✅ Zero raw typography outside `styles/kit/vendor` directories
- ✅ All page layouts use CVA factories from `src/styles/ui/**`
- ✅ Mobile-safe at 360px viewport (no horizontal scroll, no clipped content)
- ✅ ESLint config bugs fixed, enforcement working
- ✅ Knip shows no unused exports/files
- ✅ New ripgrep checks pass in `pnpm check`

---

## Out of Scope (Phase 4 - separate PR)

- Storybook setup + component stories
- Playwright visual regression baselines
- Lighthouse CI mobile budgets
