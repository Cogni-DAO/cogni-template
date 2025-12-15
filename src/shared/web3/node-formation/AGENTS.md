# node-formation · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @Cogni-DAO
- **Last reviewed:** 2025-12-13
- **Status:** draft

## Purpose

Node Formation P0 web3 primitives: Aragon OSx ABIs, CogniSignal ABI, contract bytecode placeholders, and chain address constants.

## Pointers

- [Node Formation Spec](../../../docs/NODE_FORMATION_SPEC.md)
- [Aragon OSx v1.4.0](https://github.com/aragon/osx/tree/v1.4.0)

## Boundaries

```json
{
  "layer": "shared",
  "may_import": ["shared", "types"],
  "must_not_import": ["core", "ports", "adapters", "features", "app"]
}
```

## Public Surface

- **Exports:**
  - `DAO_FACTORY_ABI` - DAOFactory.createDao + pluginSetupProcessor
  - `TOKEN_VOTING_ABI` - TokenVoting.getVotingToken
  - `GOVERNANCE_ERC20_ABI` - GovernanceERC20.balanceOf
  - `COGNI_SIGNAL_ABI` - CogniSignal.DAO
  - `COGNI_SIGNAL_BYTECODE` - Deployment bytecode (placeholder)
  - `ARAGON_OSX_ADDRESSES` - Per-chain OSx deployment addresses
  - `TOKEN_VOTING_VERSION_TAG` - Plugin version (v1.4.0)
- **CLI:** none
- **Env/Config keys:** none
- **Files considered API:** `index.ts`, all exported constants

## Responsibilities

- This directory **does**: Provide minimal ABIs for DAO formation, export bytecode constants, maintain chain address mappings
- This directory **does not**: Encode setup data (see `packages/aragon-osx`), make RPC calls, handle wallet signing

## Usage

```typescript
import {
  DAO_FACTORY_ABI,
  TOKEN_VOTING_ABI,
  COGNI_SIGNAL_ABI,
  COGNI_SIGNAL_BYTECODE,
} from "@/shared/web3/node-formation";
```

## Standards

- Minimal ABI surfaces only (no full contract interfaces)
- ABIs extracted from OSx v1.4.0 or cogni-gov-contracts Foundry artifacts
- Bytecode placeholders updated when artifacts available
- **CRITICAL:** Struct field order must match OSx exactly:
  - DAOSettings: trustedForwarder, daoURI, subdomain, metadata
  - PluginSetupRef: versionTag (uint8 release, uint16 build), pluginSetupRepo

## Dependencies

- **Internal:** none
- **External:** none (pure constants)

## Change Protocol

- Update when OSx addresses change or new chains added
- Sync address changes with [NODE_FORMATION_SPEC.md](../../../docs/NODE_FORMATION_SPEC.md) appendix
- Bytecode updates require artifact re-extraction

## Notes

- `COGNI_SIGNAL_BYTECODE` is placeholder `"0x"` until build-time extraction implemented
- Real OSx addresses hardcoded (Base Mainnet, Base Sepolia, Sepolia)
