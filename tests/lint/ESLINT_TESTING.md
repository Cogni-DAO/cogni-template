# ESLint Policy Integration Tests

This document outlines the test coverage for our bespoke ESLint policy, which enforces:

- CVA-only styling (no literal className usage)
- Hexagonal architecture boundaries
- Kit component purity
- Layer-specific import restrictions

## Test Coverage (32 High-Value Cases)

### CVA-Only Styling (className) — Must Catch Violations

**Direct Violations:**

- `src/app/page.tsx` — `<div className="flex gap-2" />` → FAIL (`no-restricted-syntax`)
- `src/app/page.tsx` — `<div className={\`flex ${gap}\`} />` → FAIL (`no-restricted-syntax`)
- `src/app/page.tsx` — `<div className={["flex","gap-2"].join(" ")} />` → FAIL (`no-restricted-syntax`)
- `src/app/page.tsx` — `const cls="flex"; <div className={cls} />` → FAIL (`no-restricted-syntax`)

**cn() Violations:**

- `src/app/page.tsx` — `<div className={cn("flex","gap-2")} />` → FAIL (`no-restricted-syntax`)
- Mixed CVA + literal — `<div className={cn(button({size:"md"}),"mt-2")} />` → FAIL (`no-restricted-syntax`)

**Style Violations:**

- `<div style={{ opacity: 0.5 }} />` → FAIL (`no-inline-styles`)

**CVA Happy Paths:**

- `src/components/kit/inputs/Button.tsx` — `<button className={button({variant:"primary",size:"md"})}/>` → PASS
- CVA param literals — `className={badge({ intent: cond ? "secondary" : "default" })}` → PASS
- `src/styles/ui.ts` — literal class strings in CVA definitions → PASS

### Kit Layer Guardrails — Must Catch Violations

**Kit Purity:**

- `src/components/kit/layout/Container.tsx` — props destructure includes className or JSX spreads `{...{className}}` → FAIL (`no-restricted-syntax` selector on kit paths)
- `src/components/kit/...` — `<div className="p-4" />` → FAIL (`no-restricted-syntax`)

**Kit Happy Path:**

- `src/components/kit/...` — `<div className={container({size:"lg"})} />` → PASS

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

- `src/app/page.tsx` with `"flex"` literal → FAIL
- Kit component that mistakenly forwards className → FAIL
- Features import from `@/components` → PASS

## Implementation

Tests are implemented as **integration tests** that:

- Create real temporary files with correct paths to trigger ESLint overrides
- Use our actual `eslint.config.mjs` (patched for test environment)
- Run ESLint against on-disk fixtures, not in-memory strings
- Test rule ID + message substring, not full snapshots
- Focus on policy enforcement, not ESLint internals

This ensures our bespoke CVA enforcement, boundaries, and import restrictions work correctly in the real development environment.
