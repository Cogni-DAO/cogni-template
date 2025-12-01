# Handoff: Tailwind v4 Spacing Token Conflict

**Date:** 2025-12-02
**Branch:** `fix/ui-mobile`
**Status:** Fix attempted, not yet verified

## Problem Statement

The `/credits` page renders with a "squashed" layout - elements collapse to near-zero width, showing only a vertical line where the `SectionCard` should be. The `/dummy` page (using identical components) renders correctly.

**Visual symptoms:**

- Balance card renders narrow but visible
- Below it, a long vertical line extends down the screen (collapsed `SectionCard`)
- The `SplitInput` and other children are invisible/collapsed

## Root Cause (High Confidence)

**Tailwind v4's `@theme inline` namespace collision.**

In Tailwind v4, defining ANY `--spacing-*` variables in `@theme inline` **replaces the entire default spacing scale**. The codebase had:

```css
/* These broke Tailwind's numeric spacing */
--spacing-xs: 0.25rem;
--spacing-sm: 0.5rem;
--spacing-md: 1rem;
--spacing-lg: 1.5rem;
--spacing-xl: 2rem;
--spacing-hero-xs: 0.3125rem;
--spacing-hero-xl: 1.25rem;
--spacing-rainbow: 8.4375rem;
```

This caused utilities like `p-6`, `px-4`, `space-y-6`, `py-6` to fail because `--spacing-6`, `--spacing-4` were no longer defined by Tailwind.

**Evidence:** User confirmed that removing similar extended spacing tokens (`--spacing-2xs`, `--spacing-3xl`, etc.) previously fixed the `/dummy` page.

## Fixes Applied (This Session)

### 1. Removed semantic spacing tokens from `@theme inline`

**File:** `src/styles/tailwind.css` (lines ~173-177)

```css
/* REMOVED - these override Tailwind v4's numeric scale */
--spacing-xs: 0.25rem;
--spacing-sm: 0.5rem;
--spacing-md: 1rem;
--spacing-lg: 1.5rem;
--spacing-xl: 2rem;
```

Replaced with explanatory comment.

### 2. Renamed hero spacing tokens to avoid `--spacing-*` namespace

**File:** `src/styles/tailwind.css` (lines ~179-181)

```css
/* Before */
--spacing-hero-xs: 0.3125rem;
--spacing-hero-xl: 1.25rem;
--spacing-rainbow: 8.4375rem;

/* After */
--hero-spacing-xs: 0.3125rem;
--hero-spacing-xl: 1.25rem;
--hero-spacing-rainbow: 8.4375rem;
```

### 3. Updated code.ts to use renamed tokens

**File:** `src/styles/ui/code.ts` (lines 34-36, 55)

Changed `var(--spacing-hero-*)` → `var(--hero-spacing-*)`

## What Still Needs Migration

There are **60+ usages** of `var(--spacing-xs|sm|md|lg|xl)` throughout the codebase that now reference **undefined CSS variables**. These need to be migrated to Tailwind's numeric utilities:

| Old Token      | Tailwind Numeric | Value   |
| -------------- | ---------------- | ------- |
| `--spacing-xs` | `1`              | 0.25rem |
| `--spacing-sm` | `2`              | 0.5rem  |
| `--spacing-md` | `4`              | 1rem    |
| `--spacing-lg` | `6`              | 1.5rem  |
| `--spacing-xl` | `8`              | 2rem    |

**Files with usages (run `rg 'var\(--spacing-(xs|sm|md|lg|xl)\)'`):**

- `src/styles/ui/layout.ts` (~25 usages)
- `src/styles/ui/data.ts` (~20 usages)
- `src/styles/ui/overlays.ts` (~15 usages)
- `src/styles/ui/payments.ts` (~5 usages)
- `src/components/kit/feedback/Alert.tsx`
- `src/components/kit/payments/UsdcPaymentFlow.tsx`
- `src/components/kit/sections/FeaturesGrid.tsx`
- `src/features/home/components/KpiBadge.tsx`
- `src/app/(public)/page.tsx`
- `src/app/wallet-test/page.tsx`
- Various test files in `tests/lint/`

## Verification Steps

1. Run `pnpm dev` and check `/credits` page renders correctly
2. Check `/dummy` page still works
3. Check homepage (`/`) renders correctly (uses many spacing tokens)
4. Run `pnpm check` to ensure no build/lint errors

## If Fix Doesn't Work

The issue may be more nuanced. Other possibilities:

1. **CSS specificity/order:** Check if `@import "tw-animate-css"` is causing conflicts
2. **Build cache:** Try `rm -rf .next && pnpm build`
3. **Browser cache:** Hard refresh with DevTools open
4. **Inspect computed styles:** In DevTools, check what value `padding`, `gap` properties resolve to on the collapsed elements

## Key Files Reference

| File                                            | Purpose                         |
| ----------------------------------------------- | ------------------------------- |
| `src/styles/tailwind.css`                       | Theme tokens in `@theme inline` |
| `src/components/kit/layout/PageContainer.tsx`   | Uses `space-y-6 px-4 py-6`      |
| `src/components/kit/layout/SectionCard.tsx`     | Uses `space-y-6 px-6 py-6`      |
| `src/components/vendor/shadcn/card.tsx`         | Uses `p-6`, `space-y-1.5`       |
| `src/app/(app)/credits/CreditsPage.client.tsx`  | The broken page                 |
| `src/app/(public)/dummy/CreditsBody.client.tsx` | The working reference           |

## Tailwind v4 Spacing Lesson

**Never define `--spacing-*` variables in `@theme inline` unless you define the COMPLETE scale including all numeric values (0-96).**

Use a different prefix for semantic tokens (e.g., `--space-*`, `--gap-*`, `--pad-*`) to avoid namespace collision with Tailwind's built-in `--spacing-*` scale.
