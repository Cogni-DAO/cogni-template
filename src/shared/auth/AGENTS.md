# src/shared/auth · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-23
- **Status:** stable

## Purpose

Shared authentication types and session identity definitions used across app layer and adapters. Provides TypeScript types for Auth.js session data including wallet address extensions.

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
  - `Session` - Extended Auth.js session type
  - Re-exports all from `./session.ts`
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`, `session.ts`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define and export shared TypeScript types for Auth.js session data with wallet address extension
- This directory **does not**: Implement runtime authentication logic, handle session management, or perform any I/O operations

## Usage

Import session types in application code or adapters:

```typescript
import type { Session, SessionUser } from "@/shared/auth";
```

## Standards

- Pure type definitions only, no runtime code
- Must remain framework-agnostic (no Auth.js runtime imports)
- Types extend Auth.js base types via module augmentation

## Dependencies

- **Internal:** `@/types` (for global type augmentation)
- **External:** `next-auth` (for base Session/User types)

## Change Protocol

- Update this file when **Exports** change (new session properties)
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Keep aligned with `src/auth.ts` JWT callbacks

## Notes

- Session types must match what Auth.js JWT callbacks populate
- `walletAddress` is the primary user identifier in this system (wallet-first auth)
- No test files needed (pure types, covered by TypeScript compiler)
