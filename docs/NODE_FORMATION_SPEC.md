# Node Formation Design

> [!CRITICAL]
> Node Formation is Node-owned tooling. No Operator dependencies. Wallet signs in browser; server verifies before persisting.

## Core Invariants

1. **Minimal User Input (P0)**: Form collects only:
   - `tokenName` (string) - e.g., "Cogni Governance"
   - `tokenSymbol` (string) - e.g., "COGNI"
   - `initialHolder` (address) - single founder, receives 1e18 tokens

   User wallet signs 2 transactions: `createDao` + `deployCogniSignal`. Multi-holder deferred to P1.

2. **Aragon-Minted Token**: Use Aragon's GovernanceERC20 minted during DAO creation. No custom NonTransferableVotes deployment. Tokens are transferable (anti-vote-buying is NOT a P0 invariant).

3. **No Private Key Env Vars**: All transactions signed via wallet UI (wagmi/rainbowkit), never by script-loaded secrets.

4. **Server Verification Boundary**: Browser is untrusted. Server derives ALL addresses from tx receipts. Request contains only `{ chainId, daoTxHash, signalTxHash, initialHolder }`.

5. **Package Isolation**: `setup-core` cannot import `src/`, `services/`, or browser/node-specific APIs.

6. **Fork Freedom**: Formation tooling works standalone without Cogni Operator accounts.

→ Ancestor analysis: [DAO Formation Script](DAO_FORMATION_SCRIPT.md)

---

## P0 Implementation Details

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

### Page Structure (TODO)

**Target:**

- `src/app/setup/dao/page.tsx` - Main wizard page
- `src/app/setup/dao/_components/` - ConfigStep, PreflightStep, DeployStep, VerifyStep, SuccessStep

### Server Verification Endpoint

**Contract Schema:** → `src/contracts/setup.verify.v1.contract.ts`

**Implementation:** → `src/app/api/setup/verify/route.ts`

**Receipt Decoders:** → `packages/setup-core/src/osx/receipt.ts`

Server derives addresses from receipts (never trusts client):

1. Decode `daoTxHash` → extract DAO + plugin addresses from events (DAORegistered, InstallationApplied)
2. Call `TokenVoting(plugin).getVotingToken()` → token address
3. Decode `signalTxHash` → extract CogniSignal address from contractAddress
4. Verify `balanceOf(initialHolder) == 1e18` and `CogniSignal.DAO() == dao`
5. Return verified addresses + repo-spec YAML

### viem Encoding (TokenVoting Setup with Mint)

**Encoder:** → `packages/setup-core/src/encoding.ts` (`encodeTokenVotingSetup`)

**Constants:** → `packages/setup-core/src/osx/version.ts` (DEFAULT_VOTING_SETTINGS, MINT_SETTINGS_VERSION)

**Tx Builders:** → `src/features/setup/daoFormation/txBuilders.ts` (`buildCreateDaoArgs`, `buildDeploySignalArgs`)

7-param struct encoding: VotingSettings, TokenSettings, MintSettings, TargetConfig, minApprovals, pluginMetadata, excludedAccounts

Current implementation uses v1.3 MintSettings (2 fields). Supports v1.4 (3 fields with `ensureDelegationOnMint`) via parameter.

---

## Implementation Checklist

### P0: Web DAO Formation (MVP)

- [x] Create `packages/setup-core/` with encoding + address constants (enhanced with osx/ subdirectory for events, receipt decoders, version constants)
- [ ] Verify TokenVoting MintSettings struct against OSx v1.4.0 ABI (determine if `ensureDelegationOnMint` field exists)
- [ ] Add Foundry-vs-viem encoding parity test fixture (blocked: needs MintSettings field verification first)
- [x] Implement Aragon OSx preflight (getCode + factory→PSP invariant) → `src/features/setup/hooks/useAragonPreflight.ts`
- [x] Implement `DAOFactory.createDao` call with TokenVoting + MintSettings → `src/features/setup/hooks/useDAOFormation.ts` + `src/features/setup/daoFormation/txBuilders.ts`
- [x] Implement `CogniSignal(dao)` deployment → `src/features/setup/hooks/useDAOFormation.ts` (uses `useDeployContract`)
- [x] Server endpoint: derive addresses from receipt events (pin exact event signatures) → `src/app/api/setup/verify/route.ts` + `packages/setup-core/src/osx/receipt.ts`
- [x] Server endpoint: verify balanceOf + CogniSignal.DAO() → `src/app/api/setup/verify/route.ts`
- [x] Export repo-spec YAML with `chain_id` as string → `buildRepoSpecYaml()` in verify route
- [x] Build wizard UI → `src/app/(app)/setup/dao/page.tsx` + `DAOFormationPage.client.tsx` + `src/features/setup/components/FormationFlowDialog.tsx`
- [x] Error normalization utility → `src/shared/errors/onchain-ui-error.ts` (EIP-1193 code-based with debug details)
- [ ] Integration testing (end-to-end DAO formation flow)

#### Known Issues

- **Transaction Revert**: `createDao` reverts with "Internal JSON-RPC error". Version tag updated to `(1, 3)` and MintSettings to v1.4 based on Foundry script. Needs verification against live contract ABI.
- **Encoding Parity**: No test fixture comparing Foundry-generated bytes vs TypeScript encoding. Blocked pending revert resolution.

#### Chores

- [x] Documentation updates → Created AGENTS.md files for `src/app/(app)/setup`, `src/features/setup`, `src/features/setup/components`
- [ ] Observability instrumentation [observability.md](../.agent/workflows/observability.md)

### P1: Multi-Holder + CLI Setup Tools

- [ ] Multi-holder support (multiple initial token recipients)
- [ ] Create `packages/setup-cli/` with Node adapters (fs, shell, gh, tofu)
- [ ] Implement `pnpm setup local` for contributor workflow
- [ ] Implement `pnpm setup infra --env preview|production`
- [ ] Implement `pnpm setup github --env preview|production`
- [ ] Add WalletConnect adapter (CLI wallet signing if proven needed)

### P2: Full npx End-to-End (Deferred)

- [ ] Evaluate after P1 adoption
- [ ] npx-based repo clone + init + DAO formation flow
- [ ] **Do NOT build preemptively**

---

## File Pointers (P0 Scope)

**Implemented:**

| File                                                   | Status | Description                                            |
| ------------------------------------------------------ | ------ | ------------------------------------------------------ |
| `packages/setup-core/src/aragon.ts`                    | ✅     | OSx address constants (BASE + SEPOLIA only)            |
| `packages/setup-core/src/encoding.ts`                  | ✅     | TokenVoting struct encoding (viem, v1.3/v1.4 support)  |
| `packages/setup-core/src/osx/events.ts`                | ✅     | OSx event ABIs + topic constants                       |
| `packages/setup-core/src/osx/receipt.ts`               | ✅     | Strict receipt decoders (throws if events not found)   |
| `packages/setup-core/src/osx/version.ts`               | ✅     | Pinned OSx version constants                           |
| `src/shared/web3/node-formation/aragon-abi.ts`         | ✅     | Minimal ABIs: DAOFactory, TokenVoting, GovernanceERC20 |
| `src/shared/web3/node-formation/bytecode.ts`           | ✅     | CogniSignal bytecode + ABI                             |
| `src/features/setup/daoFormation/formation.reducer.ts` | ✅     | Pure reducer + types (state machine)                   |
| `src/features/setup/daoFormation/txBuilders.ts`        | ✅     | Pure tx argument builders                              |
| `src/features/setup/daoFormation/api.ts`               | ✅     | Server verification API client                         |
| `src/features/setup/hooks/useAragonPreflight.ts`       | ✅     | Preflight validation hook                              |
| `src/features/setup/hooks/useDAOFormation.ts`          | ✅     | Thin wiring layer (wagmi → reducer)                    |
| `src/app/api/setup/verify/route.ts`                    | ✅     | Server derives addresses from receipts, verifies state |
| `src/contracts/setup.verify.v1.contract.ts`            | ✅     | Zod schemas for verify request/response                |

**TODO:**

| File                                                        | Status | Description                                                    |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `packages/setup-core/src/__tests__/encoding.parity.test.ts` | ⏳     | Foundry-vs-viem parity test                                    |
| `src/app/setup/dao/page.tsx`                                | ⏳     | Wizard page (config → createDao → deploySignal → verify)       |
| `src/app/setup/dao/_components/*.tsx`                       | ⏳     | ConfigStep, PreflightStep, DeployStep, VerifyStep, SuccessStep |

---

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

---

## Design Decisions

### 1. Aragon OSx Address Mapping

Hardcoded per chainId. Server enforces `chainId in SUPPORTED_CHAIN_IDS` before any verification.

→ See: [Appendix: Aragon OSx Addresses](#appendix-aragon-osx-addresses)

**Rule:** Addresses are hardcoded constants (not user-provided). Preflight validates getCode + factory→PSP invariant.

---

### 2. Formation Transaction Flow (2 Wallet Txs)

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

**Implementation:**

- Preflight: `src/features/setup/hooks/useAragonPreflight.ts`
- State machine: `src/features/setup/daoFormation/formation.reducer.ts`
- Hook wiring: `src/features/setup/hooks/useDAOFormation.ts`

**Why 2 txs?** Aragon mints GovernanceERC20 in createDao. No custom token deployment needed.

---

### 3. TokenVoting Configuration (Exact Parity)

**Constants:** → `packages/setup-core/src/osx/version.ts` (DEFAULT_VOTING_SETTINGS)

| Setting                | Value          | Meaning                                  |
| ---------------------- | -------------- | ---------------------------------------- |
| Mode                   | EarlyExecution | Proposals can execute once threshold met |
| supportThreshold       | 500_000        | 50% (1e6 precision)                      |
| minParticipation       | 500_000        | 50% (1e6 precision)                      |
| minDuration            | 3600           | 1 hour minimum voting                    |
| minProposerVotingPower | 1e18           | 1 token to propose                       |

**Never** deviate from these values in P0 without explicit governance decision.

---

### 4. Server-Side Address Derivation (Security Boundary)

**Receipt Decoders:** → `packages/setup-core/src/osx/receipt.ts`

- `decodeDaoAddress()` - Extracts DAO from DAORegistered event (strict, throws if not found)
- `decodePluginAddress()` - Extracts plugin from InstallationApplied event (strict, throws if not found)
- `decodeSignalDeployment()` - Extracts CogniSignal from contractAddress

**Event Topics:** → `packages/setup-core/src/osx/events.ts`

- DAORegistered: `0x5c0366e72f6d8608e72a1f50a8e61fdc9187b94c8c0cee349b2e879c03a9c6d9`
- InstallationApplied: `0x6fe58f3e17da33f74b44ff6a4bf7824e31c5b4b4e6c3cb7ac8c1a0c15d4b4f24`

**Server verification flow:**

1. Validate `chainId` against SUPPORTED_CHAIN_IDS (BASE + SEPOLIA only)
2. Derive all addresses from receipts using strict decoders
3. Verify on-chain state: `balanceOf(initialHolder) == 1e18`, `CogniSignal.DAO() == dao`
4. Return repo-spec YAML

**Security:** No fallback heuristics. Missing events throw errors.

---

### 5. Encoding Parity Test (TODO)

**Target:** `packages/setup-core/src/__tests__/encoding.parity.test.ts`

TokenVoting setup encoding must match Foundry exactly. The 7-param struct includes nested tuples - any field mismatch (e.g., `MintSettings.ensureDelegationOnMint`) causes silent failure.

**Fixture generation:** Run Foundry script with known inputs, capture encoded bytes, commit as test fixture.

---

### 6. Import Boundary Enforcement

**Allowed:**

- `src/app/setup/*` → `packages/setup-core`
- `packages/setup-cli` → `packages/setup-core`

**Forbidden:**

- `packages/setup-core` → `src/*`, `services/*`, `node:fs`, `window`
- `packages/setup-cli` → `src/*`, `services/*`

**Why:** Enables future repo split. setup-core is pure; runners inject adapters.

---

### 8. Repo-Spec Output

**YAML Builder:** → `src/app/api/setup/verify/route.ts` (`buildRepoSpecYaml`)

Populates: `dao_contract`, `plugin_contract`, `signal_contract`, `chain_id` (as string)

**Invariants:**

- Server derives addresses from receipts, not client input
- `chain_id` is string (e.g., `"8453"` not `8453`)
- Canonical path: `.cogni/repo-spec.yaml`

→ Current schema: [.cogni/repo-spec.yaml](../.cogni/repo-spec.yaml)

---

## Explicit Non-Goals (P0)

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

---

## Related Docs

| Doc                                                       | Purpose                                |
| --------------------------------------------------------- | -------------------------------------- |
| [DAO Formation Script](DAO_FORMATION_SCRIPT.md)           | Ancestor: detailed Aragon OSx analysis |
| [Node vs Operator Contract](NODE_VS_OPERATOR_CONTRACT.md) | Formation is Node-owned                |
| [MVP Deliverables](MVP_DELIVERABLES.md)                   | Scope lock                             |
| [ROADMAP](../ROADMAP.md)                                  | Phase overview                         |

---

## Appendix: Aragon OSx Addresses

**Implementation:** → `packages/setup-core/src/aragon.ts` (ARAGON_OSX_ADDRESSES, getAragonAddresses)

**Supported Chains:** BASE (8453), SEPOLIA (11155111)

OSx v1.4.0 deployments. Hardcoded addresses from [cogni-signal-evm-contracts](https://github.com/Cogni-DAO/cogni-signal-evm-contracts).

**Rule:** Addresses are hardcoded constants (not user-provided). Preflight validates getCode + factory→PSP invariant.

---

**Last Updated**: 2025-12-13
**Status**: Draft
