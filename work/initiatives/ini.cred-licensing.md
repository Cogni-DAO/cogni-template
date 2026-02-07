---
work_item_id: ini.cred-licensing
work_item_type: initiative
title: Cred Licensing & Federation Enrollment
state: Paused
priority: 3
estimate: 4
summary: Signed cred policy files, federation enrollment API, append-only epoch anchoring, and licensing enforcement
outcome: Nodes can enroll in federation with signed policy files; revocation and transparency logs in place
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [web3, security, federation]
---

# Cred Licensing & Federation Enrollment

## Goal

Implement signed policy files, federation enrollment, and revocation infrastructure so that forks can run freely but only enrolled nodes receive federation benefits (branding, datasets, payout rules).

## Roadmap

> Source: `docs/CRED_LICENSING_POLICY_SPEC.md` — Spec: [cred-licensing-policy.md](../../docs/spec/cred-licensing-policy.md) (draft)

### Crawl (P0) — Signed Policy Files + Enrollment API

**Goal:** Minimal enrollment flow with signed policy verification.

| Deliverable                                                                                                   | Status      | Est | Work Item |
| ------------------------------------------------------------------------------------------------------------- | ----------- | --- | --------- |
| Add `.cogni/cred-policy.json` schema and `.cogni/cred-policy.sig` detached signature                          | Not Started | 2   | —         |
| Verify endpoint emits `repo_spec_hash`, `cred_policy_hash`, `template_commit_hash`                            | Not Started | 1   | —         |
| Operator enrollment API: `POST /api/federation/enroll`                                                        | Not Started | 2   | —         |
| Runtime gating: invalid/missing signatures → node runs, federation features disabled, UI shows "Not enrolled" | Not Started | 2   | —         |

### Walk (P1) — Append-Only Epochs + Anchoring

**Goal:** Transparency logs and supply-chain attestations for policy lifecycle.

| Deliverable                                                              | Status      | Est | Work Item |
| ------------------------------------------------------------------------ | ----------- | --- | --------- |
| `node_registry_cred_epochs` table (epoch increments only, no overwrites) | Not Started | 2   | —         |
| Transparency log anchoring (Rekor or signed git tags)                    | Not Started | 2   | —         |
| in-toto attestations + SLSA provenance for distributed builds            | Not Started | 3   | —         |

## Constraints

- Forks can run without signed policies — they lose federation features, not code access
- Sign canonical bytes of JSON/YAML (detached). Files: `.cogni/cred-policy.json`, `.cogni/cred-policy.sig`, `.cogni/repo-spec.sig`
- Only enrolled nodes can claim "Cogni Federation" branding; code license (PolyForm Shield) unchanged

## Dependencies

- [ ] Federation signing key provisioning (initially single key, rotate to multi-sig/HSM later)
- [ ] Rekor or equivalent transparency log service (P1)

## As-Built Specs

- [cred-licensing-policy.md](../../docs/spec/cred-licensing-policy.md) — signing authority, revocation model, licensing guidance (draft)

## Design Notes

Content extracted from `docs/CRED_LICENSING_POLICY_SPEC.md` during docs migration.
