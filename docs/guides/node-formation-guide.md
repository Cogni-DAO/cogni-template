---
id: node-formation-guide
type: guide
title: Node Formation — DAO Setup Guide
status: draft
trust: draft
summary: Step-by-step guide for forming a new Cogni DAO node via the web wizard.
read_when: Setting up a new DAO node, running the formation wizard, or testing formation locally.
owner: derekg1729
created: 2026-02-07
verified:
tags: [web3, setup, dao]
---

# Node Formation — DAO Setup Guide

> Source: docs/NODE_FORMATION_SPEC.md

## When to Use This

You want to create a new Cogni DAO node. The formation wizard walks you through deploying a DAO + GovernanceERC20 token + CogniSignal contract on-chain, then verifying the deployment server-side.

## Preconditions

- [ ] Wallet connected via RainbowKit (configured in `src/shared/web3/wagmi.config.ts`)
- [ ] Connected to a supported chain: Base mainnet (8453) or Sepolia testnet (11155111)
- [ ] Sufficient ETH for gas (2 transactions)
- [ ] Dev server running (`pnpm dev` or `pnpm dev:stack`)

## Steps

### 1. Navigate to the Formation Wizard

Open `/setup/dao` in the application. The wizard page is at `src/app/(app)/setup/dao/page.tsx`.

### 2. Fill in Token Details (3 fields)

| Field           | Example             | Description                                  |
| --------------- | ------------------- | -------------------------------------------- |
| `tokenName`     | "Cogni Governance"  | Human-readable name for the governance token |
| `tokenSymbol`   | "COGNI"             | Short ticker symbol                          |
| `initialHolder` | Your wallet address | Founder address — receives 1e18 tokens       |

### 3. Preflight Validation (Automatic)

The wizard runs preflight checks before enabling deployment:

1. `eth_getCode` for DAOFactory, PluginSetupProcessor, TokenVotingRepo
2. `DAOFactory.pluginSetupProcessor() == PSP` invariant check
3. Chain ID validated against `SUPPORTED_CHAIN_IDS`

If any check fails, the wizard shows an error and blocks deployment.

### 4. Sign Transaction 1: Create DAO

The wizard calls `DAOFactory.createDao()` with TokenVoting plugin and MintSettings. Your wallet signs the transaction. This deploys:

- DAO contract
- GovernanceERC20 token (mints 1e18 to `initialHolder`)
- TokenVoting plugin

### 5. Sign Transaction 2: Deploy CogniSignal

After TX 1 confirms, the wizard deploys `CogniSignal(daoAddress)`. The DAO address is derived client-side from the TX 1 receipt.

### 6. Server Verification (Automatic)

The wizard submits `{ chainId, daoTxHash, signalTxHash, initialHolder }` to the server endpoint (`POST /api/setup/verify`). The server:

1. Derives ALL addresses from transaction receipts (never trusts client)
2. Verifies `balanceOf(initialHolder) == 1e18`
3. Verifies `CogniSignal.DAO() == daoAddress`
4. Returns verified addresses + repo-spec YAML

### 7. Save Repo Spec

The returned `repoSpecYaml` should be saved to `.cogni/repo-spec.yaml` in your repository.

## Verification

After formation completes successfully:

1. Check that `.cogni/repo-spec.yaml` contains `dao_contract`, `plugin_contract`, `signal_contract`, and `chain_id` (as string)
2. Verify the DAO exists on the Aragon app for your chain
3. Confirm token balance: `balanceOf(initialHolder)` should return `1000000000000000000` (1e18)

## Troubleshooting

### Problem: Preflight fails with "Contract not found"

**Solution:** Ensure you're connected to a supported chain (Base mainnet or Sepolia). The Aragon OSx contracts are only deployed on these chains.

### Problem: Transaction reverts during createDao

**Solution:** Check that you have sufficient ETH for gas. The `createDao` call deploys multiple contracts and requires more gas than a simple transfer.

### Problem: Server verification returns error

**Solution:** The server uses strict receipt decoders — missing events cause errors. Ensure both transactions confirmed successfully on-chain before the verify call.

## Related

- [Node Formation Spec](../spec/node-formation.md)
- [Node Formation Initiative](../../work/initiatives/ini.node-formation-ui.md)
- [Node vs Operator Contract](../spec/node-operator-contract.md)
- [Cred Licensing Policy](../spec/cred-licensing-policy.md)
