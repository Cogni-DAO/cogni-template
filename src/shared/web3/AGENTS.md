# web3 · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-12
- **Status:** stable

## Purpose

Shared blockchain configuration for web3 integrations. Provides hardcoded Base mainnet chain constants for DePay widgets and wagmi providers.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Chain Configuration](../../../docs/CHAIN_CONFIG.md)
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
  - `CHAIN` - wagmi Chain object for Ethereum Sepolia testnet (evm-wagmi.ts)
  - `CHAIN_ID` - Ethereum Sepolia testnet chain ID (11155111)
  - `getChainId()` - Function returning chain ID
  - `USDC_TOKEN_ADDRESS` - Official USDC contract on Ethereum Sepolia testnet
  - `MIN_CONFIRMATIONS` - Minimum confirmations required for payment verification
  - `VERIFY_THROTTLE_SECONDS` - Verification polling throttle (10 seconds)
  - `ERC20_ABI` - Generic ERC20 ABI (balanceOf, decimals, transfer)
  - `EvmOnchainClient` - Infrastructure interface for EVM RPC operations (onchain/)
  - `getAddressExplorerUrl()` - Generate block explorer URL for address
  - `getTransactionExplorerUrl()` - Generate block explorer URL for transaction
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none (chain hardcoded to Ethereum Sepolia)
- **Files considered API:** chain.ts, evm-wagmi.ts, erc20-abi.ts, block-explorer.ts, onchain/evm-onchain-client.interface.ts, index.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: provide single source of truth for chain configuration; export Base mainnet constants
- This directory **does not**: perform network calls; handle wallet connections; manage environment variables

## Usage

```typescript
import { CHAIN, CHAIN_ID, USDC_TOKEN_ADDRESS } from "@/shared/web3";
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

- Chain locked to Ethereum Sepolia (11155111) for MVP testing
- wagmi.config.ts exists for client-side wallet config but NOT exported from index.ts (prevents server-side import)
- EvmOnchainClient extended with getNativeBalance() and getErc20Balance() for treasury reads
- ERC20_ABI is generic (token-agnostic); used by treasury adapter for USDC balance queries
- evm-wagmi.ts separates wagmi types from framework-agnostic chain.ts
- EvmOnchainClient is an infrastructure seam (NOT a domain port) shared by multiple adapters
- Production uses ViemEvmOnchainClient with lazy initialization (allows builds without EVM_RPC_URL)
- Tests use FakeEvmOnchainClient (no RPC calls, no URL needed)
- Build fails if repo-spec chain_id mismatches app CHAIN_ID
