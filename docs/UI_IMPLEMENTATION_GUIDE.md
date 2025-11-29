# UI Implementation Guide

Canonical reference for UI development. Read this before writing any UI code.

## TL;DR — 5 Rules

1. **Kit is the only API surface** — Import from `@/components`, never from `@/styles/ui` or vendor directories directly.
2. **Tokens only** — All colors, spacing, typography use semantic tokens. ESLint enforces via `no-raw-colors`.
3. **className = layout only** — Pass `className` for flex/grid/gap/margin. Never for colors or typography.
4. **Check kit first** — Before creating new UI, scan `src/components/kit/`. Extend existing components via variants.
5. **Mobile-first** — Design at 360px. Single-column stack default. No fixed heights.

---

## Architecture Layers

See [ARCHITECTURE.md Enforcement Rules](ARCHITECTURE.md#enforcement-rules) for canonical import patterns.

**Import rules**:

| Layer            | Can Import From                                              |
| ---------------- | ------------------------------------------------------------ |
| `components/kit` | `@/styles/ui`, `@radix-ui/*`, vendor internals               |
| `features/*`     | `@/components` (kit barrel), `@/core`, `@/ports`, `@/shared` |
| `app/*`          | `@/components`, `@/features/*/components/*`                  |

**Never**: features → `@/styles/ui` directly. Only kit wraps styling.

---

## Component Placement

| Directory                    | Purpose                                 | Example                        |
| ---------------------------- | --------------------------------------- | ------------------------------ |
| `src/components/kit/`        | Reusable primitives (domain-neutral)    | `Button`, `Badge`, `Container` |
| `src/components/app/shell/`  | Global layout                           | `AppShell`, `MainHeader`       |
| `src/components/app/common/` | Cross-feature, Cogni-specific           | `UserMenu`, `DaoStatusBadge`   |
| `src/features/*/components/` | Feature-specific (used once)            | `HomeHeroSection`              |
| `src/styles/ui/`             | CVA factories (literal classes allowed) | `button`, `badge`, `grid`      |

**Decision tree**:

- Building for reuse? → `components/kit/`
- Feature-specific or exploring? → `features/*/components/`
- Used by 2+ features, Cogni-specific? → `components/app/common/`

**Promotion**: feature → app/common → kit (after 2+ consumers)

---

## Styling System

### Token Architecture

| File                      | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `src/styles/tailwind.css` | CSS custom properties (source of truth) |
| `src/styles/theme.ts`     | TypeScript keys (no values)             |
| `src/styles/ui/*.ts`      | CVA factories                           |

**Adding a token**:

1. Add `--token-name` to `tailwind.css`
2. Add key to `theme.ts`
3. Use `prefix-[var(--token-name)]` or semantic utility

### Token Rules (ESLint + CI Enforced)

**Colors** (ESLint `no-raw-colors`):

- ✅ `bg-primary`, `text-foreground`, `border-border` (semantic)
- ✅ `bg-[var(--chart-6)]` (bracketed token)
- ❌ `bg-blue-500`, `text-red-600` (raw palette)

**Arbitrary values** (ESLint `no-arbitrary-non-token-values`):

- ✅ `rounded-[var(--radius)]`, `gap-[var(--spacing-lg)]`
- ❌ `w-[123px]`, `mt-[47px]` (magic numbers)

**Typography** (CI ripgrep check):

- ✅ Use typography tokens from `@/styles/ui` in kit components
- ❌ `text-xs`, `text-lg`, `text-2xl` outside `styles/ui/**` and `kit/**`

Typography is enforced via CI (`pnpm check`) not ESLint — keeps linting fast and low false-positives.

### CVA Pattern

```typescript
// In src/styles/ui/*.ts
const buttonToneVariants = {
  primary: "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
} satisfies Record<ToneKey, string>;

export const button = cva("inline-flex items-center ...", {
  variants: { tone: buttonToneVariants },
  defaultVariants: { tone: "primary" },
});
```

### className Policy

Kit components expose `className?: string` for **layout-only overrides**:

- ✅ `className="mt-4 flex-1"` (margin, flex)
- ✅ `className="w-full max-w-md"` (sizing)
- ❌ `className="bg-red-500 text-lg"` (color, typography) — use variants

---

## Mobile-First Axioms

1. **360px baseline** — Design for smallest viewport first
2. **Single-column stack** — Default to vertical flow; add columns only at breakpoints
3. **No fixed heights** — Use `min-h-*` or aspect ratios, except for media assets
4. **Overflow rules** — Add `min-w-0` on flex children, `overflow-x-auto` on wide content
5. **Breakpoints when forced** — Add `sm:`, `md:`, `lg:` only when the 360px layout breaks

### Layout System

| Token                     | Value  | Use Case                         |
| ------------------------- | ------ | -------------------------------- |
| `--size-container-sm`     | 42rem  | Narrow content (forms, articles) |
| `--size-container-md`     | 48rem  | Default content width            |
| `--size-container-lg`     | 64rem  | Wide content                     |
| `--size-container-xl`     | 80rem  | Full-width sections              |
| `--size-container-screen` | 1280px | Max page width                   |

**Breakpoints** (Tailwind defaults):

- `sm:` — 640px+ (landscape phones)
- `md:` — 768px+ (tablets)
- `lg:` — 1024px+ (laptops)
- `xl:` — 1280px+ (desktops)

### Responsive className Rules

Responsive prefixes are **allowed for layout**, **forbidden for styling**:

- ✅ `className="flex-col sm:flex-row"` (layout change)
- ✅ `className="grid-cols-1 md:grid-cols-2 lg:grid-cols-3"` (column change)
- ✅ `className="gap-4 lg:gap-6"` (spacing with tokens)
- ❌ `className="sm:bg-red-500"` (color override at breakpoint)
- ❌ `className="md:text-lg"` (typography override at breakpoint)
- ❌ `className="lg:[margin-left:47px]"` (magic breakpoint hack)

---

## shadcn/Radix Ownership

shadcn/Radix code is **copied and owned**, not a dependency jail:

- Upstream reference kept in file headers for updates
- Kit is the only API surface — features import from `@/components`
- Vendor files live in `src/components/vendor/ui-primitives/`
- ESLint `no-vendor-imports-outside-kit` enforces isolation

**Workflow**:

1. Copy shadcn component to `vendor/ui-primitives/shadcn/`
2. Create kit wrapper in `src/components/kit/`
3. Export from `src/components/index.ts`

---

## Quality Gates (Post-Consolidation)

For canonical kit components after [UI_CLEANUP_PLAN.md](UI_CLEANUP_PLAN.md) Phase 3.

**All gates run in CI** — not manual checklists. PR blocked if any fail.

| Gate               | Tool        | CI Command             | Requirement              |
| ------------------ | ----------- | ---------------------- | ------------------------ |
| Lint + Types       | Biome + TSC | `pnpm check`           | No errors                |
| Token enforcement  | ESLint + rg | `pnpm check`           | No raw colors/typography |
| Story              | Storybook   | `pnpm storybook:build` | All variants documented  |
| Visual Regression  | Playwright  | `pnpm test:visual`     | No unexpected changes    |
| Accessibility      | axe-core    | `pnpm e2e:a11y`        | WCAG 2.1 AA pass         |
| Mobile Performance | Lighthouse  | `pnpm lighthouse`      | Mobile score ≥ 90        |

**PR checklist** (future, after Storybook setup):

- [ ] Storybook story with all variants
- [ ] Visual regression pass (3 viewports: 360px, 768px, 1280px)
- [ ] `pnpm check` passes (includes token/typography enforcement)
- [ ] Lighthouse mobile ≥ 90

---

## Tooling Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm check            # Lint + type + format (CI entrypoint)

# Testing
pnpm test             # Unit/integration tests
pnpm e2e              # E2E tests (black box)
pnpm e2e:smoke        # Smoke tests only

# Future (after Storybook setup)
pnpm storybook        # Component catalog
pnpm storybook:build  # Build static catalog
pnpm test:visual      # Playwright visual regression
```

---

## Component Catalog

### Inputs

- [`Button`](../src/components/kit/inputs/Button.tsx) — Primary action trigger
- [`Input`](../src/components/kit/inputs/Input.tsx) — Text input field
- [`ModeToggle`](../src/components/kit/inputs/ModeToggle.tsx) — Light/dark theme switcher

### Data Display

- [`Badge`](../src/components/kit/data-display/Badge.tsx) — Status/label indicator
- [`Avatar`](../src/components/kit/data-display/Avatar.tsx) — User avatar with fallback
- [`TerminalFrame`](../src/components/kit/data-display/TerminalFrame.tsx) — Terminal-style container
- [`GithubButton`](../src/components/kit/data-display/GithubButton.tsx) — GitHub star button

### Layout

- [`Container`](../src/components/kit/layout/Container.tsx) — Max-width container
- [`Header`](../src/components/kit/layout/Header.tsx) — Page header

### Navigation

- [`NavigationLink`](../src/components/kit/navigation/NavigationLink.tsx) — Nav link with active state
- [`SkipLink`](../src/components/kit/navigation/SkipLink.tsx) — Accessibility skip link

### Sections

- [`Hero`](../src/components/kit/sections/Hero.tsx) — Hero section layout
- [`CtaSection`](../src/components/kit/sections/CtaSection.tsx) — Call-to-action section
- [`FeaturesGrid`](../src/components/kit/sections/FeaturesGrid.tsx) — Feature showcase grid

### Typography

- [`Prompt`](../src/components/kit/typography/Prompt.tsx) — Terminal prompt text
- [`CodeHero`](../src/components/kit/typography/CodeHero.tsx) — Code block with syntax tokens

### Animation

- [`Reveal`](../src/components/kit/animation/Reveal.tsx) — Scroll-triggered reveal

### Auth

- [`WalletConnectButton`](../src/components/kit/auth/SafeWalletConnectButton.tsx) — Web3 wallet connection

---

## Validation Checklist

Before submitting UI changes:

- [ ] Checked kit first — no unnecessary new primitives
- [ ] All colors/typography use semantic tokens or `[var(--token)]`
- [ ] className overrides are layout-only
- [ ] Works at 360px viewport
- [ ] Barrel exports updated (`src/components/index.ts`)
- [ ] `pnpm check` passes

---

## References

- [ARCHITECTURE.md](ARCHITECTURE.md) — Layer enforcement rules
- [UI_CLEANUP_PLAN.md](UI_CLEANUP_PLAN.md) — Consolidation roadmap
- [ui-style-spec.json](ui-style-spec.json) — Machine-readable style spec
- [src/styles/ui/](../src/styles/ui/) — CVA factory implementations
