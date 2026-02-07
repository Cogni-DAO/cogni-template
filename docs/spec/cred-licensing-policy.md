---
id: cred-licensing-policy
type: spec
title: Cred Licensing Policy
status: draft
spec_state: draft
trust: draft
summary: Federation enrollment model — signed cred policies, revocation, licensing guidance for forkable source-available repo
read_when: Working on federation enrollment, policy signing, or licensing questions
implements:
owner: derekg1729
created: 2025-12-16
verified:
tags: [web3, security, federation]
---

# Cred Licensing Policy

## Context

Cogni is source-available (PolyForm Shield). Forks are permitted. Federation benefits (branding, datasets, payout rules) require enrollment with signed policy files. This spec defines the signing, verification, and revocation model.

> [!CRITICAL]
> Federation legitimacy is enforceable; runtime obedience in a forkable repo is not. Source-available (PolyForm Shield); forks permitted. Federation benefits require enrollment.

## Goal

Define a policy signing and federation enrollment model where forks run freely but only enrolled nodes receive federation benefits, enforced through detached signatures and append-only revocation.

## Non-Goals

- Hard secure boot or DRM — forks can run without signed policies
- Runtime compliance enforcement — treated as unenforceable in forkable repos
- OSI open source certification — this is source-available, not OSI open source

## Core Invariants

1. **NO_HARD_SECURE_BOOT**: Forks can run without signed policies. They lose federation features, not code access.

2. **DETACHED_SIGNATURE_SCOPE**: Sign canonical bytes of JSON/YAML (detached). Files: `.cogni/cred-policy.json`, `.cogni/cred-policy.sig`, `.cogni/repo-spec.sig`.

3. **TRADEMARK_BOUNDARY**: Only enrolled nodes can claim "Cogni Federation" branding. Code license (PolyForm Shield) unchanged.

## Schema

**Enrollment Request (`POST /api/federation/enroll`):**

- `node_id`, `chain_id`, `dao_tx_hash`, `signal_tx_hash`
- `repo_spec_hash`, `cred_policy_hash`, `template_commit_hash`
- `founder_signature` — binds `(node_id, chain_id, dao_address, repo_spec_hash, cred_policy_hash, template_commit_hash)`

**Server Verification:**

- Derive addresses from receipts (never trust client)
- Recompute hashes from canonical forms
- Verify founder signature binding
- Accept only non-revoked keys and policy versions

## Design

### Key Decisions

### 1. Signing Authority + Revocation

**Federation Policy Signing Key:**

- Held by Operator (initially single key; rotate to multi-sig or HSM as needed)
- Key ID embedded in `.cogni/cred-policy.sig` header
- Rotation: publish new key, sign transition attestation, old key remains valid for existing policies

**Revocation Model (append-only):**

| Event Type              | Effect                                       |
| ----------------------- | -------------------------------------------- |
| Node enrollment revoked | Node loses federation features; record kept  |
| Policy version revoked  | Nodes on that version must upgrade to enroll |
| Key revoked             | Signatures from that key no longer accepted  |

**Verification Rules:**

1. Check key ID against revocation list
2. Check policy version against revocation list
3. Accept only if both non-revoked

### 2. Licensing Guidance

| Approach              | What It Covers                                               |
| --------------------- | ------------------------------------------------------------ |
| **Code License**      | Source-available (PolyForm Shield) — forks permitted         |
| **Federation Assets** | Policy signatures, datasets, payout rules → enrollment-gated |
| **Trademark/Badge**   | "Cogni Federation" branding → enrolled nodes only            |

**Hard truth:** License terms forcing runtime compliance will be bypassed and viewed as source-available, not OSI open source.

### File Pointers

| File                      | Purpose                           |
| ------------------------- | --------------------------------- |
| `.cogni/cred-policy.json` | Cred policy definition            |
| `.cogni/cred-policy.sig`  | Detached signature over policy    |
| `.cogni/repo-spec.sig`    | Detached signature over repo-spec |

## Acceptance Checks

**Automated:**

- (none yet — spec_state: draft, code not implemented)

**Manual:**

1. Node with valid signatures shows "Enrolled" in UI
2. Node without signatures runs normally but shows "Not enrolled"
3. Revoked key/policy version rejects enrollment

## Open Questions

- [ ] Multi-sig vs HSM for production signing key management?

## Related

- [node-formation.md](./node-formation.md) — P3 references this spec for federation enrollment
- [node-operator-contract.md](./node-operator-contract.md) — sovereignty invariants
- [ini.cred-licensing.md](../../work/initiatives/ini.cred-licensing.md) — implementation roadmap
