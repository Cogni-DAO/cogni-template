# Style Guide

Code style principles for Cogni-Template. Enforcement in config files (`eslint.config.mjs`, `tsconfig.json`, `.prettierrc`).

## Principles

- **Hexagonal Architecture**: Dependencies point inward. See [ARCHITECTURE.md](ARCHITECTURE.md).
- **Type Safety First**: Strict TypeScript, no `any`, explicit return types.
- **Code as Documentation**: File headers explain contracts.

## File Headers

All TypeScript/JavaScript files require TSDoc headers with SPDX license information.

### Source Files Example

```typescript
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/server`
 * Purpose: Server-side environment variable validation and type-safe configuration schema using Zod.
 * Scope: Validates process.env for server runtime; provides serverEnv object. Does not handle client-side env vars.
 * Invariants: All required env vars validated at startup; provides boolean flags for NODE_ENV variants; fails fast on invalid env.
 * Side-effects: process.env
 * Notes: Includes LLM config for Stage 8; validates URLs and secrets; provides default values where appropriate.
 * Links: Environment configuration specification
 * @public
 */
```

### Header Templates

Use these templates for different file types:

- **Source code**: [header_source_template.ts](templates/header_source_template.ts)
- **Unit/integration tests**: [header_test_template.ts](templates/header_test_template.ts)
- **End-to-end tests**: [header_e2e_template.ts](templates/header_e2e_template.ts)

## Architecture & Imports

- No `@adapters/*` → `@core/*`; use `@ports/*` only
- No parent-relative imports (`../` blocked)
- Barrel "wormholes" banned except one `index.ts` per layer root
- Path aliases required for inter-folder imports
- `verbatimModuleSyntax: true` requires explicit `import type` for types

## React & Next.js

- Default Server Components; `"use client"` only at UI leaves
- Explicit `revalidate`/`cache`/`no-store` per `fetch()`
- Strict `jsx-a11y`; accessible names required

## Styling

- Tailwind tokens only; no `style` prop
- Conventional Commits: `type(scope): subject` ≤72 chars

## References

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [google/gts](https://github.com/google/gts)
- [TSDoc](https://tsdoc.org/)
- [ARCHITECTURE.md](ARCHITECTURE.md) - Layer boundaries
- `eslint.config.mjs` - Linting rules
- `tsconfig.json` - TypeScript config

_Enforced by:_ `pnpm check` (lint, typecheck, format, tests, SPDX, repo-linter)

---

NEW changes to relax policy

## Structural Changes To Make

- [x] Update `docs/ARCHITECTURE.md` with a concise “Styling Invariants” section covering tokens, lint rules, kit/feature responsibilities, and vendor isolation.
- [x] Revise `docs/UI_IMPLEMENTATION_GUIDE.md` to document token-safe Tailwind usage, kit `className` guidance, and removal of experimental-folder carve-outs.
- [x] Remove legacy strict UI lint rules (no-className-outside-styles, CVA-only, experimental-folder exceptions) from `eslint.config.mjs` before adding the new rule set.
- [x] Implement ESLint rules `no-raw-colors`, `no-arbitrary-non-token-values`, `token-classname-patterns`, and `no-vendor-imports-outside-kit` inside `eslint.config.mjs`.
- [x] Verify the Tailwind theme exposes only the semantic token palette expected by the new lint rules (remove default `blue-500`/`gray-700` palettes, ensure colors/fonts map to tokens).
- [x] Create and reference a machine-readable token spec (e.g., `docs/ui-style-spec.json`) for AI governance tooling and style audits.
- [ ] Update kit components under `src/components/kit/*` to expose layout-only `className` overrides while keeping CVA/tokens as the source of core styling.

_Phase 1 MVP = all items above. Complete these before tackling the cleanup tasks below._

## Existing UI Component Cleanup & Simplification

_Phase 2 (follow-up PRs once Phase 1 is merged)_ — with the lint jail removed, we can streamline the current kit while keeping it reusable and token-driven:

- **Add layout-only overrides to kit primitives.** Files like `src/components/kit/inputs/Button.tsx` and `src/components/kit/inputs/ModeToggle.tsx` currently omit `className`; add `className?: string` merged via `cn()` so feature layouts can tweak spacing without re-styling the component’s core CVA output.
- **Rationalize section-specific CVAs.** `src/components/kit/sections/hero.styles.ts` exports layout CVAs (`heroButtonContainer`, `heroTextWrapper`, etc.) via the main barrel. Fold these helpers into the `Hero` component (or a local helper) and only re-export actual React primitives from `src/components/kit/sections/index.ts`.
- **Clarify vendor wrappers.** `src/components/kit/data-display/GithubButton.tsx` wraps `vendor/ui-primitives/shadcn/github-button.tsx`; audit remaining kit files to ensure every vendor primitive (dropdowns, avatars, badges) has a thin wrapper and remove any duplicate button/badge implementations still sitting under `vendor`.
- **Normalize layout primitives.** Components in `src/components/kit/layout/` (`Container.tsx`, `Header.tsx`) and sections (`CtaSection.tsx`, `FeaturesGrid.tsx`) should prefer the `container`, `grid`, and `section` helpers from `@/styles/ui`. Document (as guidance, not policy) when bespoke layouts ought to be promoted into this folder so features don’t accumulate ad-hoc flex markup.
- **Tighten barrel exports.** `src/components/index.ts` currently re-exports CVA helpers from `hero.styles.ts`; after the cleanup, keep the public surface limited to React components and stable utility hooks so consumers don’t reach into internal layout tokens.
