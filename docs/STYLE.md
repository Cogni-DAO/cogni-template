# Style Guide

Code style, formatting, and linting configuration for the Cogni-Template.

## Styling Rules

- **Tailwind CSS:** Tailwind preset + shadcn/ui only. No inline styles (`style` prop banned). Prefer theme tokens; avoid arbitrary values except in design tokens.
- **ESLint:** Boundaries + import hygiene + Tailwind + React + Unicorn + Promise. Prettier for formatting only.
- **Git Commits:** Conventional Commits enforced via commitlint. Format: `type(scope): subject` ≤72 chars.

## Import Policy

**Cross-folder imports:** Layer-specific aliases (`@ports/*`, `@features/*`, `@adapters/*`, etc.)  
**Same-folder imports:** Relative paths (`./helper`)  
**Parent relatives:** Blocked (`../` patterns forbidden)

_Config:_ `tsconfig.json` paths + `eslint.config.mjs` no-restricted-imports

## Architecture Enforcement

Hexagonal boundaries enforced via `eslint-plugin-boundaries`:

- **Core:** Standalone (no external dependencies)
- **Features:** Access ports/core/shared only
- **App:** Access features/ports/shared only
- **Adapters:** Access ports/shared only

_Rules:_ See `eslint.config.mjs` boundaries/element-types  
_Architecture:_ See [ARCHITECTURE.md](ARCHITECTURE.md) layer definitions

## Tailwind ESLint Configuration

Currently using `@poupe/eslint-plugin-tailwindcss` due to pnpm resolver issues with the official beta.

### Switching to Official Plugin

To switch back to the official plugin when stable:

1. Install: `pnpm add -D eslint-plugin-tailwindcss@latest`
2. In `eslint.config.mjs`, swap plugin import and key:
   - Enable `officialTailwind`, disable `communityTailwind`
3. Remove `@poupe/eslint-plugin-tailwindcss` if stable

## Type Safety

- **No `any`:** Full TypeScript coverage required
- **Function returns:** Explicit return types (warn level)
- **Type imports:** Prefer `import type` for types
- **Unused code:** Auto-remove unused imports/vars
- **No External Secrets:** All env vars defined via `.env.ts` schema; no hardcoded keys

_Config:_ `eslint.config.mjs` TypeScript rules

## Dependencies

- **OSS-First:** next.js, wagmi, viem, liteLLM, langgraph, langfuse, pino, loki, zod, tailwind, shadcn/ui.
- **No CommonJS:** ESM and typed packages only.
- **Tests:** vitest + playwright only.

## ESLint Plugins

- `@typescript-eslint/*` - TypeScript rules
- `eslint-plugin-boundaries` - Architecture enforcement
- `eslint-plugin-import` - Import resolution + sorting
- `no-inline-styles` - Block inline styling

_Full config:_ `eslint.config.mjs`

## Do Not Add

- Product-specific logic
- External payment providers
- Closed-source SDKs
- Inline styling or arbitrary Tailwind values
- CommonJS or untyped packages
