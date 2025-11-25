# src/shared/auth · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-23
- **Status:** stable

## Purpose

Shared authentication types and pure helpers used across app layer and adapters. Provides TypeScript types for NextAuth session data including wallet address extensions, plus pure functions for auth logic. Pure auth types + helpers; no DB, no React, no Next APIs.

## Pointers

- [Root auth module](../../auth.ts)
- [Security & Auth Spec](../../../docs/SECURITY_AUTH_SPEC.md)
- [session.ts](./session.ts) - Session type definitions

## Boundaries

```json
{
  "layer": "shared",
  "may_import": ["shared"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters/server",
    "adapters/worker",
    "adapters/cli",
    "mcp"
  ]
}
```

## Public Surface

- **Exports:**
  - `SessionUser` - Extended user type with walletAddress
  - `Session` - Extended NextAuth session type
  - `WalletSessionState` - Input type for wallet-session consistency check
  - `WalletSessionAction` - Output type ("sign_out" | "none")
  - `NormalizedAddress` - Canonical wallet address type (`0x${string}` | null)
  - `computeWalletSessionAction()` - Pure function determining sign-out necessity
  - `normalizeWalletAddress()` - Converts external addresses to canonical form
  - Re-exports all from `./session.ts` and `./wallet-session.ts`
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`, `session.ts`, `wallet-session.ts`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define shared TypeScript types for NextAuth session data with wallet address extension; provide pure helper functions for wallet-session consistency checking
- This directory **does not**: Implement runtime authentication logic, handle session management, perform I/O operations, or interact with React/Next.js APIs

## Usage

Import session types and helpers in application code or adapters:

```typescript
import type { Session, SessionUser } from "@/shared/auth";
import {
  computeWalletSessionAction,
  normalizeWalletAddress,
} from "@/shared/auth";
```

## Standards

- Pure type definitions and pure helper functions only
- Must remain framework-agnostic (no NextAuth runtime imports, no React, no Next.js)
- Types extend NextAuth base types via module augmentation
- Helper functions accept external types (wagmi, NextAuth) and normalize to canonical forms

## Dependencies

- **Internal:** `@/types` (for global type augmentation)
- **External:** `next-auth` (for base Session/User types)

## Change Protocol

- Update this file when **Exports** change (new session properties)
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Keep aligned with `src/auth.ts` JWT callbacks

## Notes

- Session types must match what NextAuth JWT callbacks populate
- `walletAddress` is the primary user identifier in this system (wallet-first auth)
- `normalizeWalletAddress()` handles boundary between external types (wagmi `undefined`, NextAuth `null | undefined`) and internal canonical form (`null`)
- Pure functions tested via unit tests in `tests/unit/auth/wallet-session.test.ts`
