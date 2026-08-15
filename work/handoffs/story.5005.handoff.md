---
id: "story.5005-handoff"
type: handoff
work_item_id: "story.5005"
status: active
created: 2026-08-15
updated: 2026-08-15
branch: "main"
last_commit: "1f506f6a75"
---

# Handoff: distribution feature — run as DEV-MANAGER for a phased rollout (Phase 1 CODE merged; we are still early)

## Mission

Pickup: run this as **`/dev-manager`** — hold ONE story-level outcome (contributors on any node earn credits → claim real DAO tokens on Base) and coordinate dev agents through a **phased rollout**. **Phase-1 CODE just merged (#2021)**, but the feature is NOT proven: proving it = a **fresh node-template node distributes** (Phase 2, untouched). toks2 proving the loop ≠ the feature proven (toks2 is the operator codebase in a costume). Your job: drive to a genuinely proven, fleet-wide feature — and **fix the work-board first**, because it lies.

## Goal

Distribution lives on **operator (prod)** AND **node-template → all forks**, each proven on its OWN governance with a real epoch (sign → DAO mints delta + sets root on Base → contributor claims; conservation holds; re-publish refused). The feature is "done" only when a **fresh node spawned from node-template** distributes — not before.

## Start By Reading

- `docs/spec/tokenomics-distribution.md` — the mechanism (this is the ONLY thing that belongs in the spec; the rollout PLAN does NOT).
- Work items (`GET /api/v1/work/items/<id>`): story.5004, **story.5005**, task.5010–5013, bug.5020, bug.5022, bug.5023, bug.5024, story.5003.
- `test-expert` skill § the walk harness (`pnpm test:walk:dev`).
- Recall `cicd-e2e-required-sequence` before any flight/promote.

## Current State (post-merge, verified)

- **#2021 MERGED to main** (`1f506f6a`) — the consolidated per-node distribution feature + double-mint fix. Proven e2e on real Base (toks2 epoch 25; conservation held) + double-mint closed at both layers (HTTP 409 A/B + fold freeze).
- **7 superseded PRs CLOSED** (#2020, #2011, #1921, #1900, #1899, #1897, #1895 — the walk P1–P4 / R1–R4 stack).
- **#2022 OPEN, ACTIVE** — dev2 building the per-node ledger queue fix (`ledger-tasks-<nodeId>`, purge legacy) = bug.5023 ≡ bug.5024. Gates real epochs, not the merged code.
- **The board is a mess (fix it first):** task.5010–5013 + bug.5023 are **orphaned** (no parent); **bug.5023 ≡ bug.5024 duplicate**; everything `needs_triage` despite the work being done. NOTE: the work-items API rejects `parent` on PATCH `{set:{…}}` — find the correct link mechanism (try `/triage` skill or the create-time field).
- **Rig live:** worktree `agent-adf6ac46c826d893e`, app+worker on toks2, `.env.cogni` symlinked, `pnpm test:walk:dev`.

## The Plan — where it must LIVE, and the phases

**The rollout plan does NOT belong in the spec or this handoff.** Put it in **work items** (execution) + **operator Dolt** (durable strategy). **Your first task:** triage the board to truth (link task.5010–5013 + bug.5023 → story.5005; close bug.5024 as dup of bug.5023 or vice-versa; mark the done items done) and write a Dolt knowledge entry capturing the phased strategy + the toks2≠generality + prod-DAO-risk insights.

- **PHASE 1 — operator.** Promote main → preview → prod (Derek gate; code is inert until configured, zero risk). Land **#2022** (candidate-a → Derek merge). Operator's OWN distribution setup on Base = **LAST**, deliberate — its DAO is the **prod Cogni DAO `0xF61c`** (code forces `emissions_holder == dao_contract == 0xF61c`).
- **PHASE 2 — node-template (the real generality proof; NOT started).** Port shared packages (cogni-contracts, aragon-osx, node-contracts, db-client, repo-spec) + the scheduler-worker fold + the per-node `/gov` UI into the node-template repo — NOT the operator-only node-wizard/gateway. Prove on a **fresh node** with its own throwaway DAO. **This is where the feature is actually proven.** No work item captures this yet — file it.
- **PHASE 3 — forks.** fork-sync to blue/habitat/poly; each proves its own governance + setup.

## Delegation — Derek vs subagents

- **Only Derek:** promote preview/prod (gate) · approve #2022 merge · Phase-2 fresh-node wallet clicks (sign/publish/claim) · the prod-DAO setup decision + wallet (Phase-1 last).
- **Subagents/dev:** #2022 queue fix → candidate-a · board triage + Dolt write · Phase-2 node-template port · UI/UX (story.5003) · test:chain CI lane (task.5012).

## Next Actions / Risks

- [ ] **First:** triage the board (link orphans, dedupe bug.5023/5024, statuses→reality) + Dolt strategy entry. The board must match reality before coordinating.
- [ ] Promote main → **preview** (safe, Phase-1 code down the pipeline) — Derek gate.
- [ ] Land **#2022** (candidate-a validate → Derek merge).
- [ ] File + start **Phase 2** (node-template port + fresh-node proof) — the generality frontier.
- 🔴 **candidate-a ≠ money proof** (no distributor there) — it proves deploy-health only. The mint loop is proven per-node with a real setup.
- 🔴 **prod DAO `0xF61c`** — operator's own distribution is real money on the real Cogni DAO. Do it LAST, deliberately, after generality is proven. Never rush it for a deadline.
- **Do NOT merge/promote/sign without Derek.** dev1 out of context; dev2 on #2022.
