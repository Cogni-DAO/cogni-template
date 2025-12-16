# cogni-contracts · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2025-12-16
- **Status:** draft

## Purpose

Pure TypeScript package for Cogni-owned contract ABIs, bytecode, and addresses. Supports CogniSignal (cross-RPC verification) and future Cogni protocol contracts. No RPC, no env, no browser/Node.js APIs.

## Pointers

- [Node Formation Spec](../../docs/NODE_FORMATION_SPEC.md)
- [Chain Deployment Tech Debt](../../docs/CHAIN_DEPLOYMENT_TECH_DEBT.md)

## Boundaries

```json
{
  "layer": "packages",
  "may_import": ["packages"],
  "must_not_import": [
    "app",
    "features",
    "ports",
    "core",
    "adapters",
    "shared",
    "services"
  ]
}
```

**External deps:** `viem` (types only). No Node.js APIs, no browser APIs.

## Public Surface

- **Exports:**
  - `COGNI_SIGNAL_ABI` - CogniSignal contract ABI
  - `COGNI_SIGNAL_BYTECODE` - CogniSignal deployment bytecode (deployed fresh at setup time)
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`, `cogni-signal/abi.ts`, `cogni-signal/bytecode.ts`

## Ports

- **Uses ports:** none
- **Implements ports:** none

## Responsibilities

- This directory **does**: Export Cogni-owned contract ABIs and bytecode constants
- This directory **does not**: Make RPC calls, read env vars, perform deployments, handle wallet signing

## Usage

```bash
pnpm --filter @cogni/cogni-contracts typecheck
pnpm --filter @cogni/cogni-contracts test
```

## Standards

- Pure exports only (no I/O, no side effects)
- All exports must work in both browser and Node.js
- ABI integrity tests enforce selector stability

## Dependencies

- **Internal:** none (standalone package)
- **External:** `viem` (types only - `Abi` type)

## Change Protocol

- Update this file when public exports or boundaries change
- ABI/bytecode changes require integrity test update in `tests/abi-integrity.test.ts`
- New contracts must include ABI, bytecode, and address constants

## Notes

- CogniSignal contract enables cross-RPC verification (prevents RPC race conditions)
- Package isolation enforced: enables future repo split (Node vs Operator)
- Bytecode is extracted from Foundry build artifacts (see CHAIN_DEPLOYMENT_TECH_DEBT.md)
