# web3 · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-24
- **Status:** draft

## Purpose

Shared blockchain configuration for web3 integrations. Provides hardcoded Base mainnet chain constants for DePay widgets and wagmi providers.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [DePay Payments](../../../docs/DEPAY_PAYMENTS.md)
- [Repo Spec](.cogni/repo-spec.yaml)

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
  - `CHAIN` - wagmi Chain object for Base mainnet (imported from wagmi/chains)
  - `CHAIN_ID` - Base mainnet chain ID (8453)
  - `getChainId()` - Function returning chain ID
  - `DEPAY_BLOCKCHAIN` - DePay blockchain identifier ("base")
  - `USDC_TOKEN_ADDRESS` - Official USDC contract on Base mainnet
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none (chain hardcoded to Base; NEXT_PUBLIC_CHAIN_ID removed)
- **Files considered API:** chain.ts, index.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: provide single source of truth for chain configuration; export Base mainnet constants
- This directory **does not**: perform network calls; handle wallet connections; manage environment variables

## Usage

```typescript
import { CHAIN_ID, DEPAY_BLOCKCHAIN, USDC_TOKEN_ADDRESS } from "@/shared/web3";
```

## Standards

- Chain configuration is hardcoded (no env override)
- Build-time validation enforces consistency with .cogni/repo-spec.yaml via scripts/validate-chain-config.ts
- EVM-only (wagmi Chain); Solana would require separate module

## Dependencies

- **Internal:** none
- **External:** wagmi/chains

## Change Protocol

- Update this file when adding new chain constants or changing target chain
- Update .cogni/repo-spec.yaml cogni_dao.chain_id to match
- Bump **Last reviewed** date
- Run `pnpm validate:chain` to verify consistency

## Notes

- Chain locked to Base mainnet (8453) for MVP
- If supporting multiple chains, this module must be refactored to accept chain selection
- Build fails if repo-spec chain_id mismatches app CHAIN_ID
