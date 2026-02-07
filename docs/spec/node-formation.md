---
id: node-formation-spec
type: spec
title: Node Formation Design
status: draft
spec_state: draft
trust: draft
summary: DAO formation via web wizard — 2-tx wallet flow, server-side receipt verification, Aragon OSx integration.
read_when: Working on DAO formation, the setup wizard, or aragon-osx package.
implements:
owner: derekg1729
created: 2026-02-07
verified:
tags: [web3, setup, dao]
---

# Node Formation Design

## Context

Node Formation is the entry point for creating a new Cogni DAO node. A web wizard guides the founder through deploying an Aragon DAO with GovernanceERC20 token and CogniSignal contract on-chain. The server independently verifies the deployment by deriving all addresses from transaction receipts.

> Node Formation is Node-owned tooling. No Operator dependencies. Wallet signs in browser; server verifies before persisting.

## Goal

Enable any founder to create a fully-verified Cogni DAO node via a 3-field web form and 2 wallet transactions, with server-side receipt verification ensuring no client-supplied addresses are trusted.

## Non-Goals

| Item                                | Reason                                   |
| ----------------------------------- | ---------------------------------------- |
| Multiple initial holders            | P1 scope (reduces P0 to 2 wallet txs)    |
| Custom NonTransferableVotes token   | Aragon GovernanceERC20 sufficient for P0 |
| Anti-vote-buying (non-transferable) | Not a P0 invariant; revisit if needed    |
| Terraform provisioning              | CLI scope (P1)                           |
| GitHub secrets automation           | CLI scope (P1)                           |
| Repo clone/patch/write              | CLI scope (P1)                           |
| CLI wallet signing                  | Web is simpler; add if proven needed     |
| Contract verification (Etherscan)   | Nice-to-have, not blocking               |

## Core Invariants

1. **MINIMAL_USER_INPUT**: Form collects only:
   - `tokenName` (string) - e.g., "Cogni Governance"
   - `tokenSymbol` (string) - e.g., "COGNI"
   - `initialHolder` (address) - single founder, receives 1e18 tokens

   User wallet signs 2 transactions: `createDao` + `deployCogniSignal`.

2. **ARAGON_MINTED_TOKEN**: Use Aragon's GovernanceERC20 minted during DAO creation. No custom NonTransferableVotes deployment. Tokens are transferable.

3. **NO_PRIVATE_KEY_ENV_VARS**: All transactions signed via wallet UI (wagmi/rainbowkit), never by script-loaded secrets.

4. **SERVER_VERIFICATION_BOUNDARY**: Browser is untrusted. Server derives ALL addresses from tx receipts. Request contains only `{ chainId, daoTxHash, signalTxHash, initialHolder }`.

5. **PACKAGE_ISOLATION**: `aragon-osx` cannot import `src/`, `services/`, or browser/node-specific APIs.

6. **FORK_FREEDOM**: Formation tooling works standalone without Cogni Operator accounts.

## Schema

**User Input (P0 form - 3 fields):**

- `tokenName` (string, required) - e.g., "Cogni Governance"
- `tokenSymbol` (string, required) - e.g., "COGNI"
- `initialHolder` (address, required) - Single founder, receives 1e18 tokens

**Derived (not user input):**

- `chainId` - From connected wallet (must be in `SUPPORTED_CHAIN_IDS`)

**Verify Request (to server):**

- `chainId`, `daoTxHash`, `signalTxHash`, `initialHolder`
- No addresses - server derives all from receipts

**Verify Response (from server):**

- `addresses.dao`, `addresses.token`, `addresses.plugin`, `addresses.signal`
- `repoSpecYaml` - Ready to write, `chain_id` as string per existing schema

**Forbidden:**

- `privateKey`, `mnemonic`, `seed`
- Client-provided addresses (server derives from receipts)

## Design

### Technology Stack

| Layer                   | Choice                                              | Rationale                                               |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| **ABI Encoding**        | viem `encodeAbiParameters`                          | Direct control over TokenVoting struct encoding         |
| **Wallet Connection**   | wagmi + RainbowKit (existing)                       | Already configured in `src/shared/web3/wagmi.config.ts` |
| **Tx Signing**          | `useWriteContract` + `useWaitForTransactionReceipt` | Proven pattern in `usePaymentFlow.ts`                   |
| **State Machine**       | `useReducer`                                        | Proven pattern for multi-step async flows               |
| **Contract Deployment** | wagmi `useDeployContract`                           | For CogniSignal only (no custom token)                  |
| **Server Verification** | viem `getTransactionReceipt` + `decodeEventLog`     | Server derives addresses from receipt events            |

**Why NOT Aragon SDK?**

- Adds abstraction over single `DAOFactory.createDao()` call
- We need exact control over TokenVoting encoding (MintSettings with initial holder)
- viem encoding matches Foundry script 1:1 (easier to audit parity)

### Contract ABIs Required

**Aragon ABIs:** → `src/shared/web3/node-formation/aragon-abi.ts`

- DAOFactory (createDao, pluginSetupProcessor)
- TokenVoting (getVotingToken)
- GovernanceERC20 (balanceOf)

**CogniSignal:** → `src/shared/web3/node-formation/bytecode.ts`

- ABI + bytecode for deployment (extracted from cogni-gov-contracts)

**Source:** Minimal ABIs from OSx v1.4.0 contracts and Foundry artifacts.

### Hook Architecture

**State Machine:** → `src/features/setup/daoFormation/formation.reducer.ts`

Phases: IDLE → PREFLIGHT → CREATING_DAO → AWAITING_DAO_CONFIRMATION → DEPLOYING_SIGNAL → AWAITING_SIGNAL_CONFIRMATION → VERIFYING → SUCCESS/ERROR

**Hooks:**

- `src/features/setup/hooks/useDAOFormation.ts` - Thin wagmi wiring layer
- `src/features/setup/hooks/useAragonPreflight.ts` - Preflight validation

**Pure Modules:**

- `src/features/setup/daoFormation/txBuilders.ts` - Transaction argument builders
- `src/features/setup/daoFormation/api.ts` - Server verification client

### Server Verification Endpoint

**Contract Schema:** → `src/contracts/setup.verify.v1.contract.ts`

**Implementation:** → `src/app/api/setup/verify/route.ts`

**Receipt Decoders:** → `packages/aragon-osx/src/osx/receipt.ts`

Server derives addresses from receipts (never trusts client):

1. Decode `daoTxHash` → extract DAO + plugin addresses from events (DAORegistered, InstallationApplied)
2. Call `TokenVoting(plugin).getVotingToken()` → token address
3. Decode `signalTxHash` → extract CogniSignal address from contractAddress
4. Verify `balanceOf(initialHolder) == 1e18` and `CogniSignal.DAO() == dao`
5. Return verified addresses + repo-spec YAML

### viem Encoding (TokenVoting Setup with Mint)

**Encoder:** → `packages/aragon-osx/src/encoding.ts` (`encodeTokenVotingSetup`)

**Constants:** → `packages/aragon-osx/src/osx/version.ts` (DEFAULT_VOTING_SETTINGS, MINT_SETTINGS_VERSION)

**Tx Builders:** → `src/features/setup/daoFormation/txBuilders.ts` (`buildCreateDaoArgs`, `buildDeploySignalArgs`)

7-param struct encoding: VotingSettings, TokenSettings, MintSettings, TargetConfig, minApprovals, pluginMetadata, excludedAccounts

Current implementation uses v1.3 MintSettings (2 fields). Supports v1.4 (3 fields with `ensureDelegationOnMint`) via parameter.

### Key Decisions

#### 1. Aragon OSx Address Mapping

Hardcoded per chainId. Server enforces `chainId in SUPPORTED_CHAIN_IDS` before any verification.

**Rule:** Addresses are hardcoded constants (not user-provided). Preflight validates getCode + factory→PSP invariant.

#### 2. Formation Transaction Flow (2 Wallet Txs)

```
┌─────────────────────────────────────────────────────────────────────┐
│ PREFLIGHT (client-side, blocking)                                   │
│ ─────────────────────────────────                                   │
│ 1. Wallet connects, chainId validated against SUPPORTED_CHAIN_IDS   │
│ 2. eth_getCode for DAOFactory, PSP, TokenVotingRepo                 │
│ 3. DAOFactory.pluginSetupProcessor() == PSP                         │
│ 4. Result: PROCEED or ABORT                                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (if preflight passed)
┌─────────────────────────────────────────────────────────────────────┐
│ TX 1: CREATE DAO (wallet-signed)                                    │
│ ────────────────────────────────                                    │
│ - DAOFactory.createDao(daoSettings, pluginSettings)                 │
│ - TokenVoting plugin + GovernanceERC20 deployed by Aragon           │
│ - MintSettings mints 1e18 to initialHolder                          │
│ - Capture daoTxHash                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TX 2: DEPLOY SIGNAL (wallet-signed)                                 │
│ ───────────────────────────────────────                             │
│ - Deploy CogniSignal(daoAddress)                                    │
│ - daoAddress derived client-side from TX 1 receipt                  │
│ - Capture signalTxHash                                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ SERVER VERIFICATION (server-side)                                   │
│ ─────────────────────────────────                                   │
│ - POST { chainId, daoTxHash, signalTxHash, initialHolder }          │
│ - Server derives ALL addresses from receipts (never trusts client)  │
│ - Server verifies balanceOf + CogniSignal.DAO()                     │
│ - Returns addresses + repo-spec YAML                                │
└─────────────────────────────────────────────────────────────────────┘
```

**Why 2 txs?** Aragon mints GovernanceERC20 in createDao. No custom token deployment needed.

#### 3. TokenVoting Configuration (Exact Parity)

**Constants:** → `packages/aragon-osx/src/osx/version.ts` (DEFAULT_VOTING_SETTINGS)

| Setting                | Value          | Meaning                                  |
| ---------------------- | -------------- | ---------------------------------------- |
| Mode                   | EarlyExecution | Proposals can execute once threshold met |
| supportThreshold       | 500_000        | 50% (1e6 precision)                      |
| minParticipation       | 500_000        | 50% (1e6 precision)                      |
| minDuration            | 3600           | 1 hour minimum voting                    |
| minProposerVotingPower | 1e18           | 1 token to propose                       |

**Never** deviate from these values without explicit governance decision.

#### 4. Server-Side Address Derivation (Security Boundary)

**Receipt Decoders:** → `packages/aragon-osx/src/osx/receipt.ts`

- `decodeDaoAddress()` - Extracts DAO from DAORegistered event (strict, throws if not found)
- `decodePluginAddress()` - Extracts plugin from InstallationApplied event (strict, throws if not found)
- `decodeSignalDeployment()` - Extracts CogniSignal from contractAddress

**Event Topics:** → `packages/aragon-osx/src/osx/events.ts`

- DAORegistered: `0x5c0366e72f6d8608e72a1f50a8e61fdc9187b94c8c0cee349b2e879c03a9c6d9`
- InstallationApplied: `0x6fe58f3e17da33f74b44ff6a4bf7824e31c5b4b4e6c3cb7ac8c1a0c15d4b4f24`

**Server verification flow:**

1. Validate `chainId` against SUPPORTED_CHAIN_IDS (BASE + SEPOLIA only)
2. Derive all addresses from receipts using strict decoders
3. Verify on-chain state: `balanceOf(initialHolder) == 1e18`, `CogniSignal.DAO() == dao`
4. Return repo-spec YAML

**Security:** No fallback heuristics. Missing events throw errors.

#### 5. Import Boundary Enforcement

**Allowed:**

- `src/app/setup/*` → `packages/aragon-osx`
- `packages/setup-cli` → `packages/aragon-osx`

**Forbidden:**

- `packages/aragon-osx` → `src/*`, `services/*`, `node:fs`, `window`
- `packages/setup-cli` → `src/*`, `services/*`

**Why:** Enables future repo split. aragon-osx is pure; runners inject adapters.

#### 6. Repo-Spec Output

**YAML Builder:** → `src/app/api/setup/verify/route.ts` (`buildRepoSpecYaml`)

Populates: `dao_contract`, `plugin_contract`, `signal_contract`, `chain_id` (as string)

**Invariants:**

- Server derives addresses from receipts, not client input
- `chain_id` is string (e.g., `"8453"` not `8453`)
- Canonical path: `.cogni/repo-spec.yaml`

> Current schema: [.cogni/repo-spec.yaml](../../.cogni/repo-spec.yaml)

### File Pointers

| File                                                    | Purpose                                                |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `packages/aragon-osx/src/aragon.ts`                     | OSx address constants (BASE + SEPOLIA only)            |
| `packages/aragon-osx/src/encoding.ts`                   | TokenVoting struct encoding (viem, v1.3/v1.4 support)  |
| `packages/aragon-osx/src/osx/events.ts`                 | OSx event ABIs + topic constants                       |
| `packages/aragon-osx/src/osx/receipt.ts`                | Strict receipt decoders (throws if events not found)   |
| `packages/aragon-osx/src/osx/version.ts`                | Pinned OSx version constants                           |
| `src/shared/web3/node-formation/aragon-abi.ts`          | Minimal ABIs: DAOFactory, TokenVoting, GovernanceERC20 |
| `src/shared/web3/node-formation/bytecode.ts`            | CogniSignal bytecode + ABI                             |
| `src/features/setup/daoFormation/formation.reducer.ts`  | Pure reducer + types (state machine)                   |
| `src/features/setup/daoFormation/txBuilders.ts`         | Pure tx argument builders                              |
| `src/features/setup/daoFormation/api.ts`                | Server verification API client                         |
| `src/features/setup/hooks/useAragonPreflight.ts`        | Preflight validation hook                              |
| `src/features/setup/hooks/useDAOFormation.ts`           | Thin wiring layer (wagmi → reducer)                    |
| `src/app/api/setup/verify/route.ts`                     | Server derives addresses from receipts, verifies state |
| `src/contracts/setup.verify.v1.contract.ts`             | Zod schemas for verify request/response                |
| `src/app/(app)/setup/dao/page.tsx`                      | Wizard entry point                                     |
| `src/app/(app)/setup/dao/DAOFormationPage.client.tsx`   | Client component with form + flow orchestration        |
| `src/features/setup/components/FormationFlowDialog.tsx` | Modal dialog for progress/success/error states         |

### Appendix: Aragon OSx Addresses

**Implementation:** → `packages/aragon-osx/src/aragon.ts` (ARAGON_OSX_ADDRESSES, getAragonAddresses)

**Supported Chains:** BASE (8453), SEPOLIA (11155111)

OSx v1.4.0 deployments. Hardcoded addresses from [cogni-signal-evm-contracts](https://github.com/Cogni-DAO/cogni-signal-evm-contracts).

**Rule:** Addresses are hardcoded constants (not user-provided). Preflight validates getCode + factory→PSP invariant.

## Acceptance Checks

**Manual:**

1. Successfully deployed DAOs on Base mainnet, verified via Aragon app
2. Server derives all addresses from receipts without client-provided addresses
3. `balanceOf(initialHolder) == 1e18` verified on-chain
4. Observability event `SETUP_DAO_VERIFY_COMPLETE` emitted with outcome, chainId, duration

## Open Questions

(none)

## Related

- [Node vs Operator Contract](./node-operator-contract.md)
- [Cred Licensing Policy](./cred-licensing-policy.md)
- [Node Formation Initiative](../../work/initiatives/ini.node-formation-ui.md)
- [Node Formation Guide](../guides/node-formation-guide.md)
- [ROADMAP](../../ROADMAP.md)
