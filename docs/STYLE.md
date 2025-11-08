# Style Guide

Code style principles for Cogni-Template. Enforcement in config files (`eslint.config.mjs`, `tsconfig.json`, `.prettierrc`).

## Principles

- **Hexagonal Architecture**: Dependencies point inward. See [ARCHITECTURE.md](ARCHITECTURE.md).
- **Type Safety First**: Strict TypeScript, no `any`, explicit return types.
- **Code as Documentation**: File headers explain contracts.

## File Headers

All `src/**/*.{ts,tsx}` require:

1. SPDX license comment (first line)
2. TSDoc block: Purpose, Scope, Invariants, Side-effects, Notes, Links, `@public`/`@internal`/`@beta`

```typescript
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO
/**
 * Module: @shared/env/server // stable import id
 * Purpose: [1-3 sentences]
 * Scope: [what it owns; what it doesn't]
 * Invariants: [≤3 guarantees]
 * Side-effects: none | IO | time | randomness | process.env | global
 * Notes: [≤3 gotchas]
 * Links: [ADR-###, Contract XYZ]
 * @public
 */
```

Examples: `src/components/ui/button.tsx`, `src/shared/env/client.ts`

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
