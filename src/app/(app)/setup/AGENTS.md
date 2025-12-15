# setup · AGENTS.md

> Scope: this directory only. Keep ≤150 lines.

## Metadata

- **Owners:** @cogni-dao/core
- **Last reviewed:** 2025-12-13
- **Status:** stable

## Purpose

Web pages for DAO formation and node configuration workflows. Protected route group requiring wallet connection.

## Pointers

- [NODE_FORMATION_SPEC.md](../../../../docs/NODE_FORMATION_SPEC.md): P0 MVP design
- [CHAIN_ACTION_FLOW_UI_SPEC.md](../../../../docs/CHAIN_ACTION_FLOW_UI_SPEC.md): vNext reusable UI components

## Boundaries

```json
{
  "layer": "app",
  "may_import": ["features", "components", "shared", "types", "contracts"],
  "must_not_import": ["core", "ports", "adapters", "bootstrap"]
}
```

## Public Surface

- **Routes:**
  - `/setup/dao` [GET] - DAO formation wizard (wallet-signed transactions)
- **Exports:** none (page components only)
- **Env/Config keys:** none
- **Files considered API:** none

## Responsibilities

- This directory **does**: Render setup pages, wire feature hooks to UI components
- This directory **does not**: Contain transaction logic, state machines, or API calls

## Usage

```bash
# Access page (requires running dev server + wallet connection)
open http://localhost:3000/setup/dao
```

## Standards

- All pages delegate to `.client.tsx` for client-side interactivity
- Follow Credits page pattern (PageContainer + SectionCard + feature hook)
- Use existing kit components; no feature-specific UI primitives here

## Dependencies

- **Internal:** `@/features/setup`, `@/components`, `@/shared/web3`
- **External:** wagmi, viem, lucide-react

## Change Protocol

- Update when adding new `/setup/*` routes
- Bump **Last reviewed** date
- Keep route list in sync with filesystem

## Notes

- Protected route group - requires wallet connection via `(app)` layout
- All pages delegate to `.client.tsx` for client-side logic
