# SourceCred Service

# Metadata

- **Type**: Service
- **Status**: Production
- **Owner**: Platform Team

## Architecture

- **Type**: Single Container (Docker Compose)
- **Port**: `6006` (Internal), exposed via Edge/Caddy.
- **Data**: State stored in `instance/data` (ledger) and `plugin` config in `instance/config`.

## Invariants

1.  **Immutable Runner**: We DO NOT build SourceCred on the VM. We use a pinned, immutable runner image built via `release.sh`.
    - **Tagging**: Tags are immutable (e.g., `sc0.11.2-node18-2025-12-07`).
    - **Deploy**: Deployment script must `pull` the specific tag.
2.  **Command Override**: The service definition must override the command to `sourcecred go && sourcecred serve` to guarantee data loading on startup.
3.  **Token**: `SOURCECRED_GITHUB_TOKEN` is required for Github plugin connectivity.

## Release Process

To update the SourceCred runtime (e.g., Node version or SourceCred version):

1.  Edit `Dockerfile.sourcecred`.
2.  Run `./release.sh <new-tag>`.
3.  Update `docker-compose.sourcecred.yml` with the new tag.

## Boundaries

- **Public**: Exposed via Caddy reverse proxy.
- **Filesystem**: Mounts local `./instance` directory.
