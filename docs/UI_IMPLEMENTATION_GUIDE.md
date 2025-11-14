# UI Implementation Guide

A practical guide to our layered UI architecture with CVA styling.

## Architecture Layers (Import Rules)

See [ARCHITECTURE.md Enforcement Rules](ARCHITECTURE.md#enforcement-rules) for canonical import patterns and entry points.

**UI-specific rules**:

- `components/kit` → `@/styles/ui`, vendor/ui-primitives
- `features` → `@/components` only (never `@/styles/ui` directly)
- `app` → `@/components`, `@/features/*/components/*`

## Directory Structure & Component Placement

- **`src/components/kit/`** - Reusable components across features. Styled wrappers using CVA. No className prop.
- **`src/components/app/shell/`** - Global layout components (AppShell, MainHeader, Footer)
- **`src/components/app/common/`** - Cross-feature app components (UserMenu, DaoStatusBadge)
- **`src/features/*/components/`** - Feature-specific components (used only once). Use kit components.
- **`src/features/*/experimental/components/`** - Rapid experimentation. Raw Tailwind allowed by linter. Code will not pass review until converted to project standards.
- **`src/styles/ui/`** - CVA factories using design tokens. Only place with className literals.
- **`src/components/vendor/ui-primitives/`** - Vendored code (shadcn). Read-only, no @/\* imports.

**Placement Decision**: Building for reuse? → `components/kit/`. Feature-specific? → `features/*/components/`. Need to experiment quickly? → `features/*/experimental/components/`.

**Promotion Rules**: feature → app/common (2+ features, Cogni-specific) → kit (generic, domain-neutral)

## Core Workflow

### 1. Before Building Anything

**Avoid implementing new primitives at all costs!** Scan `/src/components/kit/` first and prioritize reuse. If not found, check shadcn or Radix for appropriate primitives.

### 2. Need New Styling?

1. **Maximize reuse of existing tokens** - Only create new ones with user approval for truly novel work
2. **Extend existing components** rather than creating new ones
3. **Add CVA factory** in `src/styles/ui/` if absolutely needed
4. **Export from barrel** at `src/components/index.ts`

### 3. Extending vs Creating

**❌ Wrong**: Create new component (IconButton, TextWithSpacing)  
**✅ Right**: Extend existing component with new props (Button.rightIcon)

**Naming**: Kit stays canonical (`CtaSection`), features get domain prefix (`HomeCtaSection`). See `/home` components for examples.

## Using Vendor Components (shadcn/Radix)

### shadcn Integration

1. **Use shadcn CLI** to generate component OR copy from docs
2. **Place files under** `src/components/vendor/ui-primitives/shadcn/`
3. **Replace imports** (e.g., cn) with local `./vendorUtils`
4. **Never re-export vendor** - always wrap via kit
5. **Examples**: See existing files in `/src/components/vendor/ui-primitives/shadcn/`

### Radix Integration

1. **Import @radix-ui/react-\*** directly in kit wrappers
2. **Style via CVA** - no className prop
3. **Examples**: See `/src/components/kit/` for Radix usage patterns

## Styling Rules

- **No className literals** anywhere except `src/styles/ui/`
- **Kit components** call `className={factory({ size, variant })}`
- **Features** only use kit component props, never direct styling
- **CVA parameters** allowed, direct className literals blocked by ESLint

**CVA Pattern**: Declare `const *Variants = { ... } satisfies Record<TokenKey,string>` and pass into cva. No inline variant objects.

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

- [ ] Scanned existing components for reuse opportunities
- [ ] Features import only from `@/components`
- [ ] Kit components don't forward className prop
- [ ] All styling goes through CVA factories
- [ ] Used existing tokens (new tokens need user approval)
- [ ] Barrel exports updated for new components
- [ ] `pnpm check` passes
