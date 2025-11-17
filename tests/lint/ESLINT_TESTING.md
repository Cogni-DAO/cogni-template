# ESLint Policy Integration Tests

This document outlines the test coverage for our bespoke ESLint policy, which enforces:

- Token-driven styling via the new UI governance rules
- Hexagonal architecture boundaries
- Kit + feature import discipline
- Layer-specific lint restrictions

## UI Governance (Tokens + Vendor) — Phase 1

- [x] **Allowed color/typography utilities:** Token-prefixed classes such as `bg-surface-2`, `bg-primary`, `text-fg-muted`, `border-border-strong`, `ring-primary`, `ring-offset-surface-1`.
- [x] **Allowed layout utilities:** Standard Tailwind ergonomics for spacing/layout (`flex`, `grid`, `gap-4`, `px-6`, `w-full`, breakpoint variants).
- [x] **Allowed arbitrary values:** Only when wrapping a token (`gap-[var(--spacing-lg)]`, `px-[var(--spacing-xl)]`, `bg-[hsl(var(--color-primary))]`).
- [x] **Allowed kit overrides:** Kit components may accept `className?: string` for layout/composition tweaks; colors and typography still come from CVA/tokens.
- [x] **Disallowed raw palette usage:** Blocks `bg-red-500`, `text-gray-600`, `ring-2`, `shadow-lg`, `from-slate-900/60`, etc.
- [x] **Disallowed raw literals:** Blocks `text-[#fff]`, `bg-[rgb(10,10,10)]`, `gap-[12px]`, `px-[1.25rem]`.
- [x] **Disallowed vendor imports outside kit:** Only files under `src/components/kit/**` may import from `src/components/vendor/ui-primitives/shadcn/**`.
- [x] **Test coverage:** `tests/lint/eslint/ui-governance.spec.ts` exercises each rule (raw colors, token allowances, arbitrary values, vendor boundaries).

## Test Coverage (32 High-Value Cases)

### Token-Driven Styling (UI Governance) — Must Catch / Allow

**Allowed literals & overrides (tests/lint/eslint/styling.spec.ts):**

- `src/app/page.tsx` — `<div className="bg-surface-2 text-fg-muted flex gap-4" />` → PASS
- Kit component merging layout overrides via CVA output remains PASS.
- `src/styles/ui/*.ts` — CVA factories with literal strings → PASS (styles layer exemption).

**Blocked cases (tests/lint/eslint/styling.spec.ts + ui-governance.spec.ts):**

- Raw palettes like `<div className="bg-red-500 text-gray-600" />` → FAIL (`ui-governance/no-raw-colors`)
- Arbitrary values without tokens `gap-[12px]`, `px-[1.25rem]` → FAIL (`ui-governance/no-arbitrary-non-token-values`)
- Hex/RGB literals `text-[#fff]`, `bg-[rgb(10,10,10)]` → FAIL (`ui-governance/no-arbitrary-non-token-values`)
- Vendor imports outside kit (features importing shadcn primitives) → FAIL (`ui-governance/no-vendor-imports-outside-kit`)

**Semantic allowance (tests/lint/eslint/ui-governance.spec.ts):**

- Token-prefixed utilities `bg-surface-*`, `text-fg-*`, `border-border-*`, `ring-primary` → PASS
- Arbitrary values wrapping tokens `gap-[var(--spacing-lg)]` → PASS
- Kit wrappers importing vendor primitives from `src/components/vendor/**` → PASS (rule active but path allowed)

### Kit Layer Guardrails — Token Discipline

- Kit components may accept `className?: string` but UI governance rules still fire on raw utilities (`tests/lint/eslint/styling.spec.ts`, `ui-governance.spec.ts`).
- Vendor boundaries enforced globally: features/app importing vendor primitives fail, kit pass (`tests/lint/eslint/ui-governance.spec.ts`).

### Features Import Boundaries — Must Catch Violations

**Allowed Imports:**

- `src/features/home/components/X.tsx` — `import { Button } from "@/components"` → PASS
- `import { Container } from "@/components/kit/layout/Container"` → PASS

**Forbidden Imports:**

- `import { button } from "@/styles/ui"` → FAIL (`no-restricted-imports`)
- `import "@/components/vendor/ui-primitives/shadcn/button"` → FAIL (`no-restricted-imports`)
- Cross-feature — `import Y from "@/features/billing/components/Y"` inside another feature → FAIL (`no-restricted-imports`)
- Parent-relative — `import "../../../shared/x"` from features → FAIL (`no-restricted-imports` patterns)

### Hexagonal Layer Boundaries — Must Catch Violations

**Core Layer:**

- `src/core/auth/session.ts` → `import { X } from "@/features/home/..."` → FAIL (`boundaries/element-types`)

**Allowed Dependencies:**

- `src/ports/http/server.ts` → `import { useCase } from "@/core/foo"` → PASS
- `src/adapters/server/worker.ts` → `import {...} from "@/ports/..."` → PASS
- `src/app/page.tsx` → imports from `@/components` and `@/features/home/...` → PASS

**Shared Layer:**

- `src/shared/util/foo.ts` → `import { C } from "@/features/..."` → FAIL (`boundaries/element-types`)

### Vendor + Styles Exemptions — Must Allow

**Vendor Exemptions:**

- `src/components/vendor/ui-primitives/shadcn/button.tsx` — literal classes → PASS
- `import { cn } from "@/shared/util"` in vendor → FAIL (`no-restricted-imports`)

**Styles Exemptions:**

- `src/styles/ui.ts` → `import { clsx } from "clsx"` → PASS (elsewhere → FAIL via `no-restricted-imports`)

### MDX/Content Allowances

**MDX Prose:**

- `src/components/mdx/Prose.tsx` or `.mdx` — `className="prose ..."` → PASS
- `src/features/docs/components/Doc.tsx` — `<Prose>...</Prose>` → PASS
- Direct `className="prose"` in features → FAIL

### Safety Regressions — Quick Canaries

**Policy Enforcement Canaries:**

- `src/app/page.tsx` with `className="bg-red-500"` → FAIL
- `src/app/page.tsx` with `className="bg-surface-2 text-fg-muted"` → PASS
- Kit component importing shadcn vendor directly → PASS (rule active but path allowed)
- Feature importing vendor primitive → FAIL

## Implementation

Tests are implemented as **integration tests** that:

- Create real temporary files with correct paths to trigger ESLint overrides
- Use our actual `eslint.config.mjs` (patched for test environment)
- Run ESLint against on-disk fixtures, not in-memory strings
- Test rule ID + message substring, not full snapshots
- Focus on policy enforcement, not ESLint internals

This ensures our bespoke CVA enforcement, boundaries, and import restrictions work correctly in the real development environment.
