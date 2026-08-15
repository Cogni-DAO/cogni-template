---
id: "story.5005-handoff"
type: handoff
work_item_id: "story.5005"
status: active
created: 2026-08-15
updated: 2026-08-15
branch: "toks2-e2e-rig"
last_commit: "57a0683c37"
---

# Handoff: multi-member-safe per-epoch distribution PUBLISH (no per-epoch vote)

## Mission

Pickup: you own getting a **working, Aragon-best-practices, fork-verified** distribution publish path for a node — so a node owner completes **deploy → finalize → publish → claim** in-app, where the per-epoch **publish is ONE direct `DAO.execute` (no vote)**, authorized **ONCE** via a scoped Aragon permission condition. The full loop was already proven once on real Base (toks2 epoch 17: deploy→finalize→fold→execute→claim, conservation held) — but via the **dead-end per-epoch-proposal** mechanism, which is scrapped (`docs/spec/tokenomics-distribution.md` § NOT acceptable). You are replacing that with the real multi-member-safe mechanism. **This is product (reaches every node via node-template), NOT a throwaway demo — Derek was explicit.**

## Goal

- Owner runs **one-time setup** (activate → deploy distributor → authorize publishing) on the node page, then **per epoch**: sign → **publish (one direct tx, no vote)** → contributor claims. On toks2, steps 1+2 are already done; only **Authorize publishing** remains.
- **E2E validation signal (local, real Base):** owner authorizes (deploy scoped condition + `grantWithCondition`, auto-executes) → `DAO.hasPermission(dao, owner, EXECUTE_PERMISSION)` == true → sign epoch 18 → publish (`DAO.execute([mint,setRoot])`) mints + sets root on Base → claim pays the leaf; conservation holds (`minted == Σ claimed`, distributor drains). Basescan links for authorize/publish/claim.
- **Pre-gas gate (non-negotiable):** the scoped condition must be **fork-verified** (anvil Base-fork: `grantWithCondition` does NOT revert + positive/negative `execute` checks) BEFORE Derek deploys real gas. Do NOT hand Derek a tx on "trust me."

## Start By Reading

- `docs/spec/tokenomics-distribution.md` — the lifecycle + authorization model (Walk = scoped `IPermissionCondition`; Run = permissionless `EmissionsExecutor`; both the per-epoch-vote AND the unconditional-grant are NOT acceptable).
- `docs/spec/identity-model.md` § **Distribution Authority + Recipient** — approver vs executor vs node-admin; recipient is `actor_id` (agent-earns/user-owns is an OPEN policy).
- `docs/spec/tokenomics.md` "Root rotation authority" (Walk = trusted governance execution; Run = Governor/Timelock).
- Contract (being rebuilt): `packages/cogni-contracts/src/distribution-publish-condition/` — must **extend Aragon's `PermissionCondition` base** (NOT hand-roll `IPermissionCondition` — that was the bug).
- Fold: `services/scheduler-worker/src/activities/ledger.ts` (`buildAndPersistCumulativeDistribution`) + `packages/aragon-osx/src/epoch-distribution-service.ts`.
- UI: `nodes/operator/app/src/features/nodes/DistributionsCard.client.tsx` (setup sequence), `.../governance/hooks/useAuthorizePublishing.ts` (grantWithCondition), `.../components/ExecuteDistributionPanel.tsx` (publish-only).

## Current State

- **Branch** `toks2-e2e-rig` @ `57a0683c37`, pushed. Worktree = `/Users/derek/dev/cogni-template/.claude/worktrees/agent-adf6ac46c826d893e`. **Do NOT merge to main without Derek's explicit approval** (hard rule).
- **Design review fixes SHIPPED** (`57a0683c`): setup (activate→deploy→authorize) unified on the node page; publish-only on `/gov/epoch`; Ownership tokenomics source from **node config not a manifest** (new `GET /api/v1/public/attribution/tokenomics`) + hero'd at top. tsc clean.
- **BUG being fixed:** the hand-rolled condition lacked ERC-165 `supportsInterface` → Aragon `grantWithCondition` reverted `0xa6a7dbbd` (ConditionInterfaceNotSupported). Confirmed by simulation: **plain `grant` proposal simulates OK; `grantWithCondition` reverts**. A background agent is rebuilding the condition to extend Aragon's `PermissionCondition` base + **fork-verifying** it. Await its result — do NOT trust it unverified.
- **Local stack (restart-stable):** app `pnpm --filter operator dev` reads `COGNI_REPO_PATH` from `.env.local` → `.harness/.cogni/repo-spec.yaml` (moved OUT of `.context` — Derek hates `.context`). Worker: source `.env.local`, `export DATABASE_URL=$DATABASE_SERVICE_URL` (app_service/BYPASSRLS — else "no claimant allocations"), `HARNESS_SPEC_DIR=.harness`, `pnpm tsx scripts/e2e/ledger-worker-host.ts`. DB truncate needs postgres superuser + `SET session_replication_role=replica` (finalize-freeze trigger). Seed: `scripts/e2e/seed-toks2.mts` (needs `DATABASE_SERVICE_URL`). Fresh **epoch 18 in review**.

## Ground truth (toks2 — throwaway governance, Base 8453)

`node_id cf909432-5324-4bff-bb2d-7806f545eeda` · DAO `0x7DeD1C96c6D27427F37F88418B2c3EB2c31eA7A5` (Aragon OSx **1.4** TokenVoting) · token `0x2A6D69Fc6fA5bD7EDe8257979099B65cf1177A8F` (212k supply, owner holds all) · distributor `0xb8a23fc6eb0848c94158c701afc7f64d9f327ceb` (DAO-owned) · plugin `0xb39c4a7e5a23005dfe3ca12c0b67d82f2302a360` · owner=executor=approver=claimant `0x070075F1389Ae1182aBac722B36CA12285d0c949`. `EXECUTE_PERMISSION_ID = keccak256(toBytes("EXECUTE_PERMISSION"))`.

## Design / Implementation Target

1. **Scoped condition, the Aragon way:** `DistributionPublishCondition is PermissionCondition` (Aragon base supplies the ERC-165 the DAO checks). `isGranted` allows ONLY `[token.mint(distributor,*), distributor.setMerkleRoot(*)]`, value==0, else false; fail-closed on malformed calldata. Compile with `@aragon/osx-commons-contracts` (osx-1.4-compatible) resolved; re-vendor abi+bytecode.
2. **Authorization is ONE-TIME + on the SETUP surface** (`DistributionsCard`), never per-epoch, never under the epoch dropdown. Publish (`ExecuteDistributionPanel`) is publish-only.
3. **Must not regress:** the fold (`fold-failure-never-undoes-finalize`, conservation), the ownership tokenomics reading from config, the local stack persistence (`.env.local`, `.harness`, app_service worker).
4. **Fix the disjoint setup UX:** consistent presentation (labeled Basescan links for the distributor/condition, not raw plaintext), plain-English step copy (activate = git record; deploy = the claim vault; authorize = one-time publish permission). Honest labels — a proposal is a proposal, publish is a direct execute.
5. **Honest residual (document, don't hide):** the scoped condition removes the per-epoch vote + caps the executor to publish-shaped actions, but does NOT bind the mint _amount_/_root_ to the finalize signature — a compromised executor could over-mint/mis-root. Full closure = the **`EmissionsExecutor`** (Run north-star: verifies the approver sig on-chain, permissionless submit, enables the agent-wallet/API loop). A is the correct real step, not a throwaway.
6. **Recipient (forward work):** the claimant is `actor_id` (agent-earns/user-owns via on-behalf-of) — see identity-model.md; not in this story's critical path but keep the model actor-keyed.

## Next Actions / Risks

- [ ] **Await the condition-rebuild agent → it must return FORK-VERIFIED** (grantWithCondition NOT reverting + positive/negative execute). Paste raw fork output; never claim success unverified.
- [ ] Then hand Derek ONE clean flow: node page → Authorize publishing (deploy condition + grant, his wallet) → `/gov/review` sign epoch 18 → `/gov/epoch` publish → `/gov/holdings` claim. Verify each on-chain (hasPermission true; distributor minted; claim balance; conservation).
- [ ] Fix the setup UX consistency (target #4) once the mechanism is fork-proven — don't polish a broken flow.
- 🔴 **RED LINE:** toks2 only (throwaway governance). Never a node whose spec carries the prod DAO `0xF61c3faf…`. Verify the governance block before any signature.
- **Human-gated:** every wallet tx is Derek's (deploy condition, authorize grant, sign, publish, claim). He is "barely here for support — just enough to catch you off the rails." Stay grounded: verify against live state (fork + on-chain reads), cite specs, one clean path — no endless forks.
- **Do NOT merge to main.** Derek approves every merge.
