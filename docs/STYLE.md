# Style Guide

Code style, formatting, and linting configuration for the Cogni-Template.

## Styling Rules

- **Tailwind CSS:** Tailwind preset + shadcn/ui only. No inline styles, no arbitrary values.
- **ESLint:** TypeScript, boundaries, tailwind, import rules + Prettier required.
- **Git Commits:** Conventional Commits enforced via commitlint. Format: `type(scope): subject` ≤72 chars.

## Tailwind ESLint Configuration

Currently using `@poupe/eslint-plugin-tailwindcss` due to pnpm resolver issues with the official beta.

### Switching to Official Plugin

To switch back to the official plugin when stable:

1. Install: `pnpm add -D eslint-plugin-tailwindcss@latest`
2. In `eslint.config.mjs`, swap plugin import and key:
   - Enable `officialTailwind`, disable `communityTailwind`
3. Remove `@poupe/eslint-plugin-tailwindcss` if stable

## Type Safety

- **No `any`:** Full TypeScript coverage required.
- **File System Boundaries:** `features/` modules isolated; no cross-feature imports.
- **No External Secrets:** All env vars defined via `.env.ts` schema; no hardcoded keys.

## Dependencies

- **OSS-First:** next.js, wagmi, viem, liteLLM, langgraph, langfuse, pino, loki, zod, tailwind, shadcn/ui.
- **No CommonJS:** ESM and typed packages only.
- **Tests:** vitest + playwright only.

## Do Not Add

- Product-specific logic
- External payment providers
- Closed-source SDKs
- Inline styling or arbitrary Tailwind values
- CommonJS or untyped packages
