# Cred Licensing Policy Design

> [!CRITICAL]
> Federation legitimacy is enforceable; runtime obedience in a forkable repo is not. Source-available (PolyForm Shield); forks permitted. Federation benefits require enrollment.

## Core Invariants

1. **No Hard Secure Boot**: Forks can run without signed policies. They lose federation features, not code access.

2. **Signature Scope**: Sign canonical bytes of JSON/YAML (detached). Files: `.cogni/cred-policy.json`, `.cogni/cred-policy.sig`, `.cogni/repo-spec.sig`

3. **Trademark Boundary**: Only enrolled nodes can claim "Cogni Federation" branding. Code license (PolyForm Shield) unchanged.

---

## Implementation Checklist

### P0: Signed Policy Files + Enrollment API

- [ ] Add `.cogni/cred-policy.json` schema and `.cogni/cred-policy.sig` detached signature
- [ ] Verify endpoint emits `repo_spec_hash`, `cred_policy_hash`, `template_commit_hash`
- [ ] Operator enrollment API: `POST /api/federation/enroll`
- [ ] Runtime gating: invalid/missing signatures → node runs, federation features disabled, UI shows "Not enrolled"

### P1: Append-Only Epochs + Anchoring

- [ ] `node_registry_cred_epochs` table (epoch increments only, no overwrites)
- [ ] Transparency log anchoring (Rekor or signed git tags)
- [ ] in-toto attestations + SLSA provenance for distributed builds

---

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

---

## Signing Authority + Revocation

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

---

## Licensing Guidance

| Approach              | What It Covers                                               |
| --------------------- | ------------------------------------------------------------ |
| **Code License**      | Source-available (PolyForm Shield) — forks permitted         |
| **Federation Assets** | Policy signatures, datasets, payout rules → enrollment-gated |
| **Trademark/Badge**   | "Cogni Federation" branding → enrolled nodes only            |

**Hard truth:** License terms forcing runtime compliance will be bypassed and viewed as source-available, not OSI open source.

---

## Related Docs

- [Node Formation Spec](NODE_FORMATION_SPEC.md) — P3 references this spec
- [Node vs Operator Contract](NODE_VS_OPERATOR_CONTRACT.md) — Sovereignty invariants

---

**Last Updated**: 2025-12-16
**Status**: Draft
