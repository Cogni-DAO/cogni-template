# SourceCred Service · AGENTS.md

> Scope: this directory only. Sourcecred instance and configuration

## Metadata

- **Owners:** @Cogni-DAO/platform-team
- **Last reviewed:** 2025-12-07
- **Status:** stable

## Purpose

Hosts the legacy SourceCred instance for contribution tracking and cred distribution.

## Pointers

- [Service Definition](./docker-compose.sourcecred.yml)
- [Deployment Script](../../../../platform/ci/scripts/deploy.sh)
- [Spec](../../../../docs/SOURCECRED.md)

## Boundaries

```json
{
  "layer": "infra",
  "may_import": ["infra"],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Requests:** Exposed via internal port `6006`, routed through Edge (Caddy).
- **Filesystem:** `./instance/data` (ledger) is the primary state.

## Responsibilities

- **Does**: Run the `sourcecred` server, maintain the cred graph/ledger.
- **Does not**: Handle authentication (done by GitHub plugin + Edge), handle payments (manual).

## Usage

**Release Process**:
To update the SourceCred runtime (e.g., Node version or SourceCred version):

1.  Edit `Dockerfile.sourcecred`.
2.  Run `./release.sh <new-tag>`.
3.  Update `docker-compose.sourcecred.yml` with the new tag.

## Standards

- **Invariants**:
  1.  **Immutable Runner**: DO NOT build on VM. Use `release.sh` to push immutable tags.
  2.  **No Command Override**: Use Dockerfile's CMD (`yarn start`). Sourcecred CLI exists only in node_modules, not in PATH.
  3.  **Token Required**: `SOURCECRED_GITHUB_TOKEN` is mandatory.

## Dependencies

- **Internal:** `platform/infra/services/edge` (Caddy reverse proxy)
- **External:** GitHub API (via SourceCred plugin)

## Change Protocol

- Update `release.sh` and `Dockerfile.sourcecred` when changing runtime dependencies.
- Bump **Last reviewed** date when significant configuration changes occur.

## Notes

- **Manual Release**: Running `./release.sh` requires `docker login` with push access to GHCR.
- **Data Persistence**: `instance/data` is mounted to `/site/data`. It persists between deployments.
