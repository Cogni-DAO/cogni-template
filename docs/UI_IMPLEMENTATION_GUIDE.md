# UI Implementation Guide

A practical guide to our layered UI architecture with CVA styling.

## Architecture Layers (Import Rules)

See [ARCHITECTURE.md Enforcement Rules](ARCHITECTURE.md#enforcement-rules) for canonical import patterns and entry points.

**UI-specific rules**:

- `components/kit` → `@/styles/ui`, vendor/ui-primitives
- `features` → `@/components` for UI components (never `@/styles/ui` directly). Other standard imports (`@/core`, `@/ports`, `@/shared`) still allowed.
- `app` → `@/components`, `@/features/*/components/*`

## Directory Structure & Component Placement

- **`src/components/kit/`** - Reusable components across features. Styled with CVA + token utilities. Expose `className?: string` for layout-only overrides (flex/grid/gap/margin), not for recoloring or typography changes.
- **`src/components/app/shell/`** - Global layout components (AppShell, MainHeader, Footer)
- **`src/components/app/common/`** - Cross-feature app components (UserMenu, DaoStatusBadge)
- **`src/features/*/components/`** - Feature-specific components (used only once). Use kit components.
- **`src/styles/ui/`** - CVA factories using design tokens (literal classes allowed here).
- **`src/components/vendor/ui-primitives/`** - Vendored code (shadcn). Read-only, no @/\* imports.

**Placement Decision**: Building for reuse? → `components/kit/`. Feature-specific or still exploring? → `features/*/components/` (use short-lived branches for spikes; no special experimental folder needed).

**Promotion Rules**: feature → app/common (2+ features, Cogni-specific) → kit (generic, domain-neutral)

## Core Workflow

### 1. Before Building Anything

**Avoid implementing new primitives at all costs!** Scan `/src/components/kit/` first and prioritize reuse. If nothing fits, check shadcn/Radix for a primitive to wrap through kit.

### 2. Need New Styling?

1. **Reuse existing tokens** — add tokens only in `tailwind.css` + `theme.ts` when semantics are missing.
2. **Extend kit components** before creating new ones; add variants/props when reasonable.
3. **Add/extend CVA helpers** in `src/styles/ui/` when a styling pattern becomes shared.
4. **Export from the barrel** at `src/components/index.ts` once the primitive is ready.

### 3. Extending vs Creating

**❌ Wrong**: Invent a bespoke primitive (IconButton, TextWithSpacing) without checking kit.  
**✅ Right**: Extend kit via variants/props (e.g., `Button` adding `rightIcon`, `Card` adding `accent`).

**Naming**: Kit stays canonical (`CtaSection`); feature components use a domain prefix (`HomeHeroSection`). Promote to kit after a second consumer.

## Using Vendor Components (shadcn/Radix)

### shadcn Integration

1. Generate (or copy) components into `src/components/vendor/ui-primitives/shadcn/`.
2. Keep vendor files isolated; only adjust imports via `./_vendorUtils`.
3. Wrap the primitive inside `src/components/kit/*` (required by `no-vendor-imports-outside-kit`).
4. Examples: `GithubButton`, `ModeToggle`, and dropdown menus in kit.

### Radix Integration

1. Import `@radix-ui/react-*` primitives directly in kit wrappers.
2. Compose CVA classes from `@/styles/ui` for the base look; `className` is available for layout tweaks only.
3. Examples: `ModeToggle`, navigation menus, and inputs under `/src/components/kit`.

## Styling Rules

- **Tokens = SoT:** define/extend tokens only in `src/styles/tailwind.css` (values) + `src/styles/theme.ts` (keys). Tailwind’s palette is trimmed to these semantics.
- **Color/typography utilities:** `bg-*/text-*/border-*/ring-*/shadow-*` classes must use semantic prefixes (e.g., `bg-surface-2`, `text-fg-muted`) or `prefix-[var(--token)]`. Raw hex/rgb/hsl values are blocked by `no-raw-colors`.
- **Arbitrary values:** Tailwind arbitrary utilities are only allowed when wrapping `var(--token)` (e.g., `gap-[var(--spacing-lg)]`), enforced by `no-arbitrary-non-token-values`.
- **Kit components:** use CVA factories for base styling but may expose `className?: string` for layout/composition overrides (flex/grid/gap/m/p/size). Do not introduce new colors/typography via `className`.
- **Feature components:** can combine kit primitives with Tailwind layout utilities directly, as long as they honor the token rules. If a layout repeats across features, promote it into kit.
- **Vendor isolation:** only kit wrappers may import from `src/components/vendor/ui-primitives/shadcn/**`, enforced by `no-vendor-imports-outside-kit`.
- **Machine-readable spec:** see `docs/ui-style-spec.json` for the canonical list of allowed prefixes/patterns used by automated audits.

**CVA Pattern**: declare `const *Variants = { ... } satisfies Record<TokenKey,string>` and pass that identifier to `cva`. Keep literal class strings inside `src/styles/ui/**`.

## Token Architecture

**Values**: `tailwind.css` (single source of truth)  
**Types**: `theme.ts` (keys only, no values)  
**Minimal Workflow**: Adding new token requires only 2 files: add `--token` to tailwind.css, add key to theme.ts, use `prefix-[var(--token)]`

**Bracketed Token Syntax**: Use `prefix-[var(--token)]` for direct token access (e.g., `text-[var(--chart-6)]`, `ring-offset-[var(--ring-offset-w-sm)]`). Prefer semantic utilities (`bg-primary`) when available. ESLint blocks raw utilities (`text-white`, `z-50`) and enforces token usage.

**Examples**: Study `/src/styles/ui/inputs.ts`, `/src/styles/ui/layout.ts` for implementation patterns

## Barrel Exports

Always update `src/components/index.ts` when adding kit components.  
**Examples**: See existing exports in `/src/components/index.ts`

## Validation Checklist

- [ ] Checked kit + vendor wrappers before adding new UI.
- [ ] Colors/typography utilities use semantic prefixes or token vars.
- [ ] Arbitrary Tailwind values wrap `var(--token)` when used.
- [ ] Kit component overrides stay layout-only; CVA handles core styling.
- [ ] Vendor primitives only referenced from kit.
- [ ] Barrels updated and `pnpm check` (lint+type+tests) passes.
