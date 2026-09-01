---
id: akash-crypto-deploy-guide
type: guide
title: Akash crypto deploy — agent-orchestrated, human-signed
status: draft
trust: draft
summary: Self-custody crypto funding rail for Akash — agent renders SDL + builds unsigned txs, human signs with their own wallet, agent broadcasts. No key ever enters Cogni (KEY_NEVER_IN_APP).
read_when: Deploying an Akash workload paid with self-custody crypto (AKT), or wiring an agent-orchestrated deploy where a human approves every signature.
owner: derekg1729
created: 2026-08-31
tags: [akash, compute, crypto, self-custody, cli, task-5049]
---

# Akash crypto deploy — agent-orchestrated, human-signed

> **Custody in one sentence:** the agent builds, queries, and broadcasts; the **human holds the wallet
> key and signs every transaction**. No private key, mnemonic, or keyring passphrase ever reaches the
> agent or Cogni — this is why the flow respects the `KEY_NEVER_IN_APP` invariant.

This is the **crypto funding rail** for Akash, complementary to the managed-Console (fiat) adapter that
bills a shared account in USD. Use this when you want a deployment paid with **your own AKT**, in
**self-custody**, with an on-chain audit trail.

Akash removed self-custody from the hosted `console.akash.network` (it "moved to Console Air"), so the
crypto path is the CLI (`provider-services`) — which is also scriptable and reproducible by an agent.

---

## Roles

| Actor     | Does                                                                                                                                  | Holds key?               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Agent** | renders SDL, generates **unsigned** txs (`--generate-only`), queries bids/lease/status, **broadcasts** signed txs, sends the manifest | **No**                   |
| **Human** | holds the Keplr/keyring wallet + AKT, runs `tx sign` (or approves in Keplr) for each unsigned tx                                      | **Yes — sole custodian** |

**Handoff is file-based.** The agent writes `artifacts/unsigned-<step>.json`; the human returns
`artifacts/signed-<step>.json`; the agent broadcasts. Those files are the audit trail — commit them to
the run log, never a key.

---

## Prerequisites (human, one-time)

1. **Wallet + funds.** Install Keplr (or `provider-services keys add`), create/import a wallet, and fund
   it with **~$30 of AKT** (buy on an exchange that supports AKT → withdraw on the **Akash** network to
   your `akash1…` address). ~5 AKT covers a small node's escrow + gas; keep a little AKT for fees.
2. **CLI.** Install `provider-services` (see Akash docs → _Install provider-services CLI_).
3. **Public config** (safe to share with the agent — none of this is a secret):
   ```bash
   export AKASH_NODE="https://rpc.akashnet.net:443"   # confirm a current mainnet RPC
   export AKASH_CHAIN_ID="akashnet-2"
   export AKASH_ACCOUNT_ADDRESS="akash1…"              # your public address
   export AKASH_GAS="auto" AKASH_GAS_ADJUSTMENT="1.4" AKASH_GAS_PRICES="0.025uakt"
   ```
4. **Keyring (human-only).** The signing key stays in the human's keyring; `AKASH_KEY_NAME` and the
   keyring passphrase are **never** exported to the agent.

---

## The loop (each tx: agent generates → human signs → agent broadcasts)

All agent steps are wrapped in `scripts/akash/`. Every `agent-*` script is **keyless**; every `human-*`
step requires the wallet and is run by the human.

### 0. One-time: client certificate

A certificate is required once per account before deploying.

```bash
# agent — generate the local cert material + the unsigned publish tx
scripts/akash/agent-cert-generate.sh                       # writes artifacts/cert (local, not a chain key)
scripts/akash/agent-gen-tx.sh cert-publish \
  tx cert publish client                                    # → artifacts/unsigned-cert-publish.json
# human — sign it
scripts/akash/human-sign.sh cert-publish                    # → artifacts/signed-cert-publish.json
# agent — broadcast
scripts/akash/agent-broadcast.sh cert-publish
```

### 1. Create the deployment

```bash
# agent — render SDL (template today; swap for buildAkashSdl once PR 2077 merges — see below)
scripts/akash/render-sdl.sh > artifacts/deploy.yaml
# agent — unsigned create tx
scripts/akash/agent-gen-tx.sh deploy \
  tx deployment create artifacts/deploy.yaml --deposit 5000000uakt
# human — sign
scripts/akash/human-sign.sh deploy
# agent — broadcast, capture the dseq from the tx result
scripts/akash/agent-broadcast.sh deploy                     # prints DSEQ
export AKASH_DSEQ=<dseq>
```

### 2. Pick a bid (keyless)

```bash
scripts/akash/agent-query-bids.sh "$AKASH_DSEQ"             # lists open bids sorted by price
export AKASH_PROVIDER=<cheapest provider addr> AKASH_GSEQ=1 AKASH_OSEQ=1
```

### 3. Create the lease

```bash
scripts/akash/agent-gen-tx.sh lease \
  tx market lease create --dseq "$AKASH_DSEQ" --gseq "$AKASH_GSEQ" \
    --oseq "$AKASH_OSEQ" --provider "$AKASH_PROVIDER"
scripts/akash/human-sign.sh lease
scripts/akash/agent-broadcast.sh lease
```

### 4. Send the manifest (keyless — cert-authenticated)

```bash
scripts/akash/agent-send-manifest.sh                        # uses artifacts/deploy.yaml + the cert
```

### 5. Read the live URL (keyless)

```bash
scripts/akash/agent-lease-status.sh                         # prints forwarded URIs → your live URL
```

### 6. Wire to shared infra (closes v000)

- Point a CNAME (e.g. `<node>-akash.cognidao.org`) at the provider URI.
- Confirm the node's telemetry reaches Grafana **via the operator** observability proxy
  (`GET /api/v1/nodes/{id}/observability/logs`), and run `docs/guides/agent-api-validation.md` against
  the live URL.

### Teardown (reclaims escrow)

```bash
scripts/akash/agent-gen-tx.sh close tx deployment close --dseq "$AKASH_DSEQ"
scripts/akash/human-sign.sh close && scripts/akash/agent-broadcast.sh close
```

---

## SDL: template now, renderer later

`scripts/akash/render-sdl.sh` emits a **template** SDL (`scripts/akash/examples/node.sdl.yaml`) so this
rail is independent of unmerged code. Once **PR 2077** lands `buildAkashSdl` +
`buildNodeWorkloadSpec` on `main`, `render-sdl.sh` should call that renderer so the crypto rail and the
managed rail deploy **byte-identical** workloads. The SDL is provider-agnostic — the _only_ difference
between the two rails is who submits and signs the tx.

## How this seeds automated crypto payment (Track B)

The `unsigned → sign → broadcast` seam is exactly where a future **automated** signer plugs in
(a Privy raw-sign spike, or a DAO co-signer) — only `human-sign.sh` gets replaced; the agent side is
unchanged. When a Cogni-side signer exists, it becomes a sibling `ComputeResourcePort` write adapter
selected by the `COMPUTE_WRITE_PROVIDER` env (the reserved seam in
`nodes/operator/app/src/bootstrap/capabilities/compute.ts`; managed stays default, crypto opt-in). No
`KEY_NEVER_IN_APP` break is introduced by this runbook.
