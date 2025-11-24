# .cogni · AGENTS.md

> Scope: .cogni directory. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-24
- **Status:** draft

## Purpose

Governance metadata for the repo. `.cogni/repo-spec.yaml` is the authoritative source for DAO wallet, chain_id, and widget provider; no environment overrides are allowed for inbound payments.

## Pointers

- [Root AGENTS.md](../AGENTS.md)
- [.cogni/repo-spec.yaml](./repo-spec.yaml)

## Boundaries

```json
{
  "layer": "meta",
  "may_import": ["*"],
  "must_not_import": []
}
```

## Public Surface

- **Exports:** repo-spec.yaml, rule files under .cogni/rules
- **Files considered API:** repo-spec.yaml

## Responsibilities

- This directory **does**: store repo-spec and rule files consumed by gates.
- This directory **does not**: contain runtime code or env overrides.

## Usage

- Update `repo-spec.yaml` to change DAO wallet/chain/provider, commit to git, redeploy.
- Build-time validation (`pnpm validate:chain` / `pnpm build`) fails if repo-spec.chain_id diverges from `@/shared/web3/CHAIN_ID`.

## Notes

- Payments widget configuration must be read server-side from repo-spec; client code only receives props.
