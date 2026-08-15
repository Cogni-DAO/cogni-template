---
id: "story.5005-handoff"
type: handoff
work_item_id: "story.5005"
status: active
created: 2026-08-15
updated: 2026-08-15
branch: "toks2-e2e-rig"
last_commit: "c8f47e59b5"
---

# Handoff: land the distribution feature — CI green → flight operator → validate → promote

## Mission

Pickup: the per-node cumulative distribution feature (finalize→fold→publish→claim; one-time **scoped** authorize, no-vote per-epoch publish) is **built, proven e2e on real Base, and open as PR #2020**. Your job is the **baseline delivery loop**, which the previous agent over-thought and got wrong: get **[#2020](https://github.com/cogni-dao/cogni/pull/2020)** CI-green, **flight the OPERATOR node to candidate-a via the STANDARD flow**, run **`/validate-candidate`**, then hand Derek a merge-ready scorecard so he approves merge → promote. Real epochs close **Sunday** and run on the **operator** node.

## Goal

- **#2020 all-green**, then **operator flighted to candidate-a** (NOT toks2 — that was the throwaway rig) and **`/validate-candidate`** passes with a real operator epoch exercising sign→publish→claim through the product UI, conservation holding.
- Candidate-a proof: the standard flight lane (through prod operator `cognidao.org`) shows the workflow run + deployed lane + `/version` SHA matching this branch's build; `/validate-candidate` scorecard posted.
- **Derek approves merge → promote** (his rule: NEVER merge to main without him). Promoted operator runs Sunday's epochs.

## Start By Reading

- `docs/spec/tokenomics-distribution.md` — the whole mechanism: Goal/Invariants/Design, **"Local rig vs production"** (the App-gateway is the biggest divergence), **"Idempotency & replay"**, and the operator-vs-node-template rollout notes.
- PR **#2020** body — the landing plan + proven-e2e summary.
- `test-expert` skill § "Tokenomics distribution e2e" — the walk harness `pnpm test:walk:dev` (fork-based sign→fold→mint→claim).
- Recall the flight SSoT: `GET /api/v1/knowledge/cicd-e2e-required-sequence` — **do this first**, don't assert the flight payload from memory.

## Current State

- Branch `toks2-e2e-rig` @ `c8f47e59b5`, pushed. **PR #2020 → `main`.** Worktree = `/Users/derek/dev/cogni-template/.claude/worktrees/agent-adf6ac46c826d893e`.
- **Rebased on real `origin/main`** (`23797d0`) — local `main` was stale, so the diff is **73 files (the real feature)**, not the 134 it first looked like. Backup tag `toks2-rig-backup`.
- **CI** (as of last push): `static` ✅, `component` ✅, all `build (*)` ✅, `manifest` ✅. `unit` failed on **format:check** → fixed + pushed in `c8f47e`; **confirm it's green now**. **`Cogni Git PR Review` FAILS** (operator AI reviewer) — read its output and address.
- **PROVEN e2e**: toks2 epoch 19 on real Base — sign→fold→publish→claim, conservation held (minted 12k == claimed 12k). That was the **rig**; production validates on **operator**.
- **Why the prev agent stalled on flight:** `.env.cogni` **does not exist in this worktree**. Get it from Derek's workspace root (`reference_cogni_api_keys`: it holds `COGNI_API_KEY_{TEST,PREVIEW,PROD}`). There is **no special "test key"** — flighting uses the standard operator key + flock-leader's operator-bridge RBAC.

## Design / Implementation Target (the corrections — do NOT repeat these mistakes)

1. **Flight = STANDARD flow through the prod operator + `/validate-candidate`.** Not a bespoke "test key," not manual curl-from-memory. flock-leader already has `can_flight` RBAC.
2. **Flight OPERATOR** (Sunday's epochs run there — `/gov/*` is self-scoped). node-template + forks are **follow-on**, not Sunday-blocking.
3. **NO new OpenFGA relations** (verified: the diff adds none; routes gate on existing `node.ownerUserId` session OR the existing `node.flight` relation). **No FGA re-bootstrap** — that risk was a phantom.
4. **node-wizard = OPERATOR-ONLY.** `DistributionsCard` + deploy/activate/authorize + `nodes/[id]` + activate route + cross-node config gateway are the operator control plane. Only the **per-epoch `/gov` surfaces (sign/publish/claim) + shared packages + worker** land in **node-template**.
5. **Must not regress:** the proven e2e mechanism (fold conservation, scoped-condition authorize, publish idempotency guard). Don't re-introduce toks2 into any production path.

## Next Actions / Risks

- [ ] **Confirm `unit` green** post-`c8f47e` (was a format:check failure). `gh pr checks 2020`.
- [ ] **Fix `Cogni Git PR Review`** failure — `gh` the check's detail / operator review output.
- [ ] **Get `.env.cogni`** into the worktree (Derek's workspace root) → recall `cicd-e2e-required-sequence` → **flight operator to candidate-a** → **`/validate-candidate`**.
- [ ] Post the validation scorecard → Derek approves **merge → promote**.
- [ ] **Follow-on (not Sunday):** reconcile the mechanism into **node-template** (authoritative for forks; `fork-sync` overlays blue/habitat/poly). Discipline: author shared code in node-template.
- 🔴 **RED LINE:** toks2 is throwaway rig; production governance is the **operator's own** DAO — never sign/route against a prod DAO `0xF61c…` or leave toks2 in a shipped path.
- ⚠️ **green-local ≠ green-gateway:** the local rig faked the operator App-gateway with baked config (`.harness`). On real operator the App must be installed or the fold falls back to baked identity.
- ⚠️ **Publish replay:** the shipped Walk guard is a UI/route check (bypassable by a raw `DAO.execute`); mandate a Safe m-of-n executor until the on-chain `EmissionsExecutor` (Run) lands. (A rig re-publish stranded 12k on the toks2 distributor — moot for prod.)
- **Do NOT merge to main.** Derek approves every merge + promote.
