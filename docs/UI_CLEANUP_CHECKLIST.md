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

- [x] ✅ **NO CHANGES NEEDED** - Status tokens already exist:
  - `src/styles/tailwind.css:133-135` defines `--color-success/warning/danger`
  - `tailwind.config.ts:28-30` exposes semantic color utilities
  - `src/styles/theme.ts:97` exports `statusKeys` array

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

#### CreditsPage.client.tsx (3 extractions)

- [ ] Extract `statsBox()` to `src/styles/ui/data.ts` (used at lines 88, 104)
- [ ] Extract `ledgerEntry()` to `src/styles/ui/data.ts` (used at line 136)
- [ ] Extract `ledgerTimestamp()` to `src/styles/ui/data.ts` (used at line 165)
- [ ] Update component imports and apply factories

**Note**: Other inline classNames are simple layout utilities (single-purpose flex/grid/spacing) and remain inline per plan.

#### chat/Terminal.tsx (5 extractions + mobile fix)

- [ ] Extract `chatContainer()` to `src/styles/ui/overlays.ts` (line 102)
- [ ] Extract `chatMessages()` to `src/styles/ui/overlays.ts` (line 103) - **includes mobile fix**: `overflow-y-scroll` + responsive padding
- [ ] Extract `chatMessage()` to `src/styles/ui/overlays.ts` (lines 111, 121, 128)
- [ ] Extract `chatDivider()` to `src/styles/ui/overlays.ts` (line 134)
- [ ] Extract `chatForm()` to `src/styles/ui/overlays.ts` (line 135) - add gap, remove Button `ml-2`
- [ ] Update component imports and apply factories

#### HomeHeroSection.tsx (mobile margin fix)

- [ ] Line 37: Add `mx-0` at base breakpoint to prevent mobile overflow
- [ ] Change `heroButtonContainer` CVA: `-mx-[var(--spacing-xl)] sm:...` → `mx-0 sm:-mx-[var(--spacing-xl)] md:...`

**Note**: Other inline CVAs in this file are component-specific layout and remain per plan.

#### KpiBadge.tsx (no changes)

**Note**: Feature-specific component with proper token usage. No extraction needed per plan.

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

- ✅ Zero raw color violations in kit layer (Alert success variant uses semantic tokens)
- ✅ Zero raw typography in kit layer (Input, Alert, GithubButton use var(--text-\*) tokens)
- ✅ Kit CVA factories in `src/styles/ui/**` only (Input factory moved to inputs.ts)
- ✅ Shared/complex patterns extracted: 3 CreditsPage factories + 5 Terminal factories
- ✅ Mobile-safe at 360px viewport (Terminal scrolling + HomeHero margins fixed)
- ✅ ESLint config bugs fixed (5/5)
- ✅ Knip scope remains UI-only (intentional)
- ✅ `pnpm check` passes (lint + type + format + ui-tokens)
- ✅ `pnpm test` passes (276 tests)
- ✅ `pnpm build` succeeds

---

## Out of Scope (Phase 4 - separate PR)

- Storybook setup + component stories
- Playwright visual regression baselines
- Lighthouse CI mobile budgets
