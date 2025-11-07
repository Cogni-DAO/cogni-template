# Style Guide

Code style, formatting, and linting configuration for the Cogni-Template.

## Styling Rules

- **Tailwind CSS:** Tailwind preset + shadcn/ui only. No inline styles (`style` prop banned). Prefer theme tokens; avoid arbitrary values except in design tokens.
- **ESLint:** Boundaries + import hygiene + Tailwind + React + Unicorn + Promise. Prettier for formatting only.
- **Git Commits:** Conventional Commits enforced via commitlint. Format: `type(scope): subject` ≤72 chars.
- **File Headers:** Required TSDoc headers on all `src/**/*.{ts,tsx}` files. See [File Header Documentation](#file-header-documentation).
- **Comments:** No mid-code comments (inline comments banned except eslint-disable/ts-ignore).

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
- `eslint-plugin-tsdoc` - TSDoc syntax validation
- `no-inline-styles` - Block inline styling

_Full config:_ `eslint.config.mjs`

## File Header Documentation

All TypeScript files in `src/**/*.{ts,tsx}` must include a TSDoc header block describing the file's contract. Headers are **required** and enforced via ESLint.

**Rationale:** Headers explain "why/when" at file scope. Exported symbols document "what/how." Keep headers brief—longer than a tweet, shorter than a page. Avoid repeating types and parameters already enforced by code.

### Header Format

**Length:** 8-15 lines max. Brevity is enforced.

**Required Format:**

1. **SPDX license line comment** (`// SPDX-License-Identifier: Polyform-Noncommercial-1.0.0`)
2. **TSDoc block comment** with `@packageDocumentation` containing:
   - **Purpose:** 1-3 sentences on the file's role and why it exists.
   - **Scope:** What this file owns; what it explicitly does not do.
   - **Invariants:** Up to 3 bullets of guarantees or contracts.
   - **Side-effects:** `none` | `IO` | `time` | `randomness` | `process.env` | `global`.
   - **Notes:** Pitfalls, concurrency or perf gotchas (≤3 bullets).
   - **Links:** ADR-###, Contract XYZ, Route /path.
   - **Visibility tag:** `@public` | `@internal` | `@beta` (standard TSDoc release tag)

### Style Guidelines

- Use standard TSDoc release tags (`@public`, `@internal`, `@beta`) for visibility.
- Avoid custom tags that lints and tools do not understand.
- Present tense only.
- No repetition of types/parameters already in code.
- Do not explain implementation—describe the contract only.
- No mid-code comments (use file headers for documentation).

### Template

```typescript
// SPDX-License-Identifier: Polyform-Noncommercial-1.0.0

/**
 * @packageDocumentation
 * Purpose: 1–3 sentences on the file's role and why it exists.
 * Scope: what this file owns; what it explicitly does not do.
 * Invariants: up to 3 bullets of guarantees or contracts.
 * Side-effects: none | IO | time | randomness | process.env | global.
 * Notes: pitfalls, concurrency or perf gotchas (≤3 bullets).
 * Links: ADR-###, Contract XYZ, Route /path.
 * @public // or @internal / @beta
 */
```

### Examples

**Component (`Button.tsx`):**

```typescript
// SPDX-License-Identifier: Polyform-Noncommercial-1.0.0

/**
 * @packageDocumentation
 * Purpose: Reusable Button component with Radix Slot and cva variants for consistent UI.
 * Scope: Provides Button component and buttonVariants. Does not handle form submission or navigation.
 * Invariants: Forwards ref; accepts aria-* and data-* unchanged; always renders valid button element.
 * Side-effects: none
 * Notes: Uses Radix Slot for composition; cva for variant management.
 * Links: ADR-UI-01
 * @public
 */
```

**Service:**

```typescript
// SPDX-License-Identifier: Polyform-Noncommercial-1.0.0

/**
 * @packageDocumentation
 * Purpose: Orchestrates payment capture against CreditsRepo and Telemetry.
 * Scope: Handles payment transactions and credit deduction. Does not handle refunds or disputes.
 * Invariants: Idempotent per (userId, memo); atomic credit deduction; audit log always written.
 * Side-effects: IO (db), telemetry event
 * Notes: Race conditions possible if same userId+memo called concurrently; consider locking.
 * Links: contract/tests/PaymentPort.contract.ts
 * @public
 */
```

**Barrel (`index.ts`):**

```typescript
// SPDX-License-Identifier: Polyform-Noncommercial-1.0.0

/**
 * @packageDocumentation
 * Purpose: Public surface for this module via re-exports.
 * Scope: Re-exports public APIs only. Does not export internal utilities.
 * Invariants: Only re-exports from ./public/*; no circular dependencies.
 * Side-effects: none
 * Notes: Changes here affect module's public API contract.
 * Links: ARCHITECTURE.md#public-surface
 * @public
 */
```

**Route:**

```typescript
// SPDX-License-Identifier: Polyform-Noncommercial-1.0.0

/**
 * @packageDocumentation
 * Purpose: POST /api/credits/redeem — validates input and redeems credits.
 * Scope: Handles credit redemption requests. Does not handle purchase or transfer.
 * Invariants: Audit log written on success; idempotent per request ID.
 * Side-effects: IO (db)
 * Notes: Rate limiting applied; validates code format before DB lookup.
 * Links: routes spec RS-07
 * @public
 */
```

### Enforcement

- **Required on:** All `src/**/*.{ts,tsx}` files.
- **Excluded:** `*.d.ts`, `*.gen.*`, test files (`*.test.ts`, `*.spec.ts`), config files.
- **ESLint rules:**
  - `tsdoc/syntax` - Validates TSDoc syntax (enforced)
  - `no-inline-comments` - Blocks mid-code comments (enforced)
- **Enforcement tools:**
  - **REUSE tool** - Enforces SPDX license line comment (see [REUSE setup](#reuse-spdx-enforcement))
  - `eslint-plugin-tsdoc` v0.4.0 - Validates TSDoc block syntax

### Division of Labor

- **File header** = Contract spec for this file (behavior, inputs/outputs, side-effects).
- **`*/AGENTS.md`** = Directory interface (exports, routes, env keys, ports, boundaries).

## REUSE SPDX Enforcement

SPDX license headers are enforced via the **REUSE tool**.

### Installation

REUSE is a Python tool. Install via pip:

```bash
pip install reuse
```

Or via package manager:

```bash
# macOS
brew install reuse

# Debian/Ubuntu
apt install reuse-tool
```

### Configuration

REUSE configuration is in `.reuse/dep5`. The tool validates that all files in `src/**/*.{ts,tsx}` have the SPDX license identifier as the first line comment:

```typescript
// SPDX-License-Identifier: Polyform-Noncommercial-1.0.0
```

### Usage

**Lint SPDX headers:**

```bash
pnpm reuse:lint
```

**Add headers to files:**

```bash
pnpm reuse:addheader
```

**In CI:**
REUSE lint should be run separately in CI (not included in `pnpm check` to avoid local dev failures):

```yaml
- run: pnpm reuse:lint
```

**Pre-commit hook (optional):**
Add to `.husky/pre-commit`:

```bash
pnpm reuse:lint
```

### Why REUSE?

- **SPDX standard:** Official tool for SPDX compliance
- **Reliable:** Designed specifically for SPDX header enforcement
- **CI-ready:** Fails builds when headers are missing or incorrect

See: https://reuse.software/

## Do Not Add

- Product-specific logic
- External payment providers
- Closed-source SDKs
- Inline styling or arbitrary Tailwind values
- CommonJS or untyped packages
- Mid-code comments (use file headers instead)
