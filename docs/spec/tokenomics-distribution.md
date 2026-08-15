---
id: tokenomics-distribution-spec
type: spec
title: "Tokenomics: Distribution Lifecycle (finalize → publish → claim)"
status: draft
spec_state: proposed
trust: draft
summary: "The on-chain distribution half of tokenomics: how a finalized epoch's signed ledger becomes minted tokens a contributor can claim. Defines the finalize→fold→publish→claim lifecycle and the ONE-TIME authorization model that replaces per-epoch DAO voting."
read_when: Building or reviewing distributor deploy/activation, the execute/publish surface, the claim surface, or the cumulative manifest. Sibling to tokenomics.md (economics) — this doc owns the mechanism.
implements: proj.transparent-credit-payouts
owner: derekg1729
created: 2026-08-15
tags: [governance, tokenomics, distribution, attribution, walk]
---

# Tokenomics: Distribution Lifecycle

> `tokenomics.md` answers "how big is the pool + what do the numbers mean." **This doc answers "how does a signed epoch ledger become tokens in a contributor's wallet."** It is the mechanism spec for Walk (first on-chain claims) — deploy, activate, publish, claim — and the authorization model that makes it scale.

## The one sentence that must stay true

**A DAO with a governance token, distributing per epoch via a Merkle distributor, driven by a single approver signature per epoch and authorized ONCE — never a per-epoch vote, never a human moving tokens, always a contributor pull.**

## Lifecycle

```
 STEP                 WHAT                                        PLANE       AUTHORIZED BY
 1 open→review   collect→select→allocate → creditAmount          off-chain   (automatic)
 2 FINALIZE      approver signs ONE EIP-712 over the final        off-chain   ◄ the ONLY per-epoch
   review→final  allocation set (ONE_ADMIN_SIGNATURE_PER_EPOCH)    (sig)         governance act
 3 FOLD (R3)     that signature → cumulative merkle manifest:     off-chain   (automatic, from the
   auto          root + per-account cumulative leaves + mint       (Postgres)   finalize signature)
                 DELTA (this epoch's new tokens). Never sends a tx.
 4 PUBLISH       DAO mint(delta) → distributor + setMerkleRoot    ON-CHAIN    ◄ ONE-TIME authorized
   per epoch     (root). Built FROM the manifest.                  (Base)        (see below) — NOT a vote
 5 CLAIM         contributor PULL: claim(acct, cumAmt, root,      ON-CHAIN    permissionless
   anytime       proof) → receives cumAmt − alreadyClaimed.        (Base)       (proof-gated)
                 ONE cumulative root covers ALL unclaimed epochs.
```

Steps 1,2,3,5 are built and correct today. **Step 4's authorization is the load-bearing design decision below.**

## Authorization model (the core spec) — one-time, never per-epoch

Per `tokenomics.md` ("Root rotation authority"): **Walk = "Safe/manual or equivalent trusted governance execution publishes roots and funding." Run = Governor/Timelock.** The per-epoch governance decision is the **off-chain finalize signature** (step 2). The on-chain publish (step 4) is a _mechanical consequence_ of that signature, gated by an authorization the DAO grants **once**.

| Rule                       | Constraint                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ONE_TIME_AUTHORIZATION     | The DAO authorizes distributions with ONE governance action (at activation). No subsequent epoch requires a DAO vote. A design that puts a tokenholder vote on the per-epoch publish path is WRONG.                                                                                                                                                                                                                           |
| MULTI_MEMBER_BY_DEFAULT    | **Assume every DAO is a real multi-member DAO** — they start somewhere (often 1 member) but WILL grow. The one-time authorization must therefore be **SCOPED**: the executor may publish distributions and NOTHING else. An _unconditional_ EXECUTE grant (executor gains arbitrary DAO authority — treasury, re-permissioning) is NOT acceptable even for a 1-member node, because the design must hold as membership grows. |
| SIGNATURE_IS_THE_AUTHORITY | The per-epoch authority to publish is the approver's finalize EIP-712 signature over the allocation set — already produced in step 2. On-chain publish verifies/derives from it; it does not re-decide it.                                                                                                                                                                                                                    |
| DAO_IS_MINTER              | The DAO holds MINT_PERMISSION on its GovernanceERC20 and mints `delta` per epoch into the distributor. Never pre-minted, never a human-moved float.                                                                                                                                                                                                                                                                           |
| DAO_OWNS_DISTRIBUTOR       | The ONE per-node CumulativeMerkleDistributor is owned by the DAO; only the DAO (or its authorized executor) can `setMerkleRoot`.                                                                                                                                                                                                                                                                                              |
| CONSERVATION               | minted == claimable == Σ(leaves); one cumulative root supersedes prior roots (SINGLE_CLAIM_COVERS_ALL).                                                                                                                                                                                                                                                                                                                       |
| PULL_NOT_PUSH              | Tokens are never pushed to wallets. Contributors claim what they're owed. (Push-to-wallet may be an opt-in node policy, vNext.)                                                                                                                                                                                                                                                                                               |

### Walk mechanism (default — scoped EXECUTE via IPermissionCondition)

At **activation**, the DAO performs ONE governance action: `grantWithCondition(where=DAO, who=executor, EXECUTE_PERMISSION, condition=DistributionPublishCondition)`. The condition is a tiny on-chain contract (`DistributionPublishCondition(token, distributor)`, deployed once per node) whose `isGranted` decodes the `DAO.execute` calldata and returns true **only** when the action set is exactly `[token.mint(distributor, *), distributor.setMerkleRoot(*)]` — nothing else, no third action, no other target. Thereafter each epoch's publish is **one direct `DAO.execute([mint, setRoot])`** by the executor — no proposal, no vote. The executor may be a Safe (m-of-n) or an agent wallet (Privy). Scope is enforced on-chain: a compromised executor key is capped to publish-shaped actions — it CANNOT drain the treasury or re-permission the DAO. **Residual trust (Walk):** the condition constrains the action SHAPE (mint-into-distributor + setRoot) but NOT the mint _amount_ or the _root_ — a malicious executor could over-mint into the distributor and set a self-serving root. Binding amount+root to the approver's finalize signature on-chain is exactly what the Run `EmissionsExecutor` (below) does; until then the executor is trusted on the values (mitigate with a Safe m-of-n). Net: this scoped condition removes the per-epoch VOTE and the treasury-drain surface; the `EmissionsExecutor` additionally removes the value-trust.
Verified feasible: OSx `PermissionManager._auth` forwards the full `execute` calldata to a bound `IPermissionCondition.isGranted`; `grantWithCondition` is authorized by `ROOT_PERMISSION` (held by the DAO itself). See story.5005 design spike.

### Run mechanism (north star — permissionless)

A minimal **`EmissionsExecutor`** contract the DAO authorizes once (grants MINT + distributor `setMerkleRoot` authority). It exposes `publishDistribution(epochId, delta, root, approverSig)` that: (1) verifies `approverSig` against the DAO-pinned approver set, (2) enforces the budget cap on-chain (`totalMinted + delta ≤ policySupply`), (3) enforces epoch monotonicity (replay guard), (4) mints + setMerkleRoot. Submission is then **permissionless** — the finalize signature IS the authorization, so an agent/keeper (or the contributor) can trigger publish with no special key at all. This is what lets the whole loop run via API + an external-agent-controlled wallet (e.g. Privy), and it removes the trusted executor entirely.

### NOT acceptable (both fail the multi-member bar)

- **Per-epoch tokenholder vote** (Aragon `createProposal` per epoch). Only _appears_ to work when one owner holds ~100% (auto early-execution); a grown DAO would vote every epoch. Dead-end.
- **Unconditional EXECUTE grant** to a Safe/EOA — gives the executor arbitrary DAO authority (treasury, re-permissioning), not just publishing. Even for a 1-member node this is wrong, because membership grows. The condition (above) is what makes the grant safe.
  Both are preserved only as reference on branch `toks2-e2e-rig` — not pursued.

## Recipient (claimant) resolution — `actor_id`, not `user_id`

The claimant a manifest leaf pays is an **economic subject** (`actor_id`, kind = user | agent | system | org), resolved to a wallet via `actor_bindings`. Agents are first-class DAO participants — an `agent` actor earns and can hold tokens. When an agent works **on-behalf-of** a user (`subjectId = user:{user_id}`), _who owns the earned tokens_ (the agent's own wallet vs the delegating user's) is an **explicit delegation policy**, never an implicit default. See [identity-model.md § Distribution Authority + Recipient](./identity-model.md#distribution-authority--recipient).

> OPEN: the resolver is user-centric today (`user:{user_id}` / `identity:{provider}:{externalId}`); `agent:{actor_id}` + subjectId-delegated routing is forward work.

## Activation (one guided flow, git-authoritative)

Activation is ONE owner-driven flow (not two buttons), recorded git-authoritatively in the node's repo-spec via the operator GitHub App (`distributions.status: active`, `governance.token_contract`, `governance.emissions_holder`, `distributions.distributor_address`, `claim_contract_pattern`). It:

1. verifies the node has a DAO + GovernanceERC20 (prereq),
2. deploys the ONE distributor (owner wallet) → `transferOwnership(DAO)` — on-chain evidence (`owner()==DAO`, `token()==token`),
3. performs the **ONE_TIME_AUTHORIZATION** grant (the meaningful governance step),
4. records everything in ONE repo-spec PR.

The on-chain deploy is irreversible truth; a failed git-record is a retryable follow-up, never a masked deploy failure (`RECORD_FAILURE_IS_NON_FATAL`).

## What is proven (2026-08-15)

First real distribution shipped on Base for `toks2`: deploy `0xb8a2…7ceb` → finalize epoch 17 → fold (root `0x17bcc008…`, 12000e18, 1 leaf) → publish (mint+setRoot) → claim. Conservation held; distributor drained. The publish used the dead-end proposal mechanism (single-owner) — the loop is proven; the authorization model is what this spec replaces.

## Surfaces + invariants map

| surface           | file(s)                                                                                                                                                 | invariant                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| deploy + activate | `features/nodes/DistributionsCard.client.tsx`, `useDeployDistributor.ts`, `api/v1/nodes/[id]/activate-distributions/route.ts`                           | DAO_OWNS_DISTRIBUTOR, ONE_TIME_AUTHORIZATION, RECORD_FAILURE_IS_NON_FATAL |
| fold              | `services/scheduler-worker/src/activities/ledger.ts` (`buildAndPersistCumulativeDistribution`), `packages/aragon-osx/src/epoch-distribution-service.ts` | fold-never-undoes-finalize, CONSERVATION                                  |
| publish           | (story.5005) execute/publish surface + executor                                                                                                         | ONE_TIME_AUTHORIZATION, SIGNATURE_IS_THE_AUTHORITY                        |
| claim             | `features/governance/components/CumulativeClaimPanel.tsx`, `useCumulativeClaim.ts`, `api/v1/public/attribution/distribution/latest`                     | PULL_NOT_PUSH, SINGLE_CLAIM_COVERS_ALL                                    |
| ownership page    | `app/(app)/gov/holdings/`                                                                                                                               | show NODE tokenomics + viewer's FULL position, not just distributed       |

## Related

- `docs/spec/tokenomics.md` — economics (budget policy, phases, enforcement progression). This doc is its distribution-mechanism sibling.
- `docs/spec/attribution-ledger.md` — steps 1–3 (epochs, selection, finalize, fold).
- Skill: `tokenomics-expert` — the one-pager entry point; links here.
- Work: story.5004 (activation unify) · story.5005 (one-time publish authorization) · task.5012 (test:chain) · task.5013 (agent-controlled wallet / Privy).
