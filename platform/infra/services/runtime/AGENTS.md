# runtime · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-03
- **Status:** draft

## Purpose

Production runtime configuration directory copied to VM hosts for container orchestration and database initialization. Contains app + postgres + litellm + alloy + temporal + git-sync services. Edge (Caddy) is in separate `../edge/` project.

## Pointers

- [docker-compose.yml](docker-compose.yml): Production container stack (app, postgres, litellm, alloy)
- [docker-compose.dev.yml](docker-compose.dev.yml): Development container stack (includes local loki, grafana)
- [postgres-init/](postgres-init/): Database initialization scripts
- [configs/](configs/): Service configuration templates (litellm, alloy)
- [docker-daemon.json](docker-daemon.json): Docker daemon log limits (reference only, applied via bootstrap.yaml)
- [Edge stack](../edge/): TLS termination (Caddy) - separate compose project, never stopped during deploys

## Boundaries

```json
{
  "layer": "infra",
  "may_import": [],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):** none
- **CLI (if any):** docker-compose commands
- **Env/Config keys:** `APP_IMAGE`, `MIGRATOR_IMAGE`, `APP_ENV`, `DEPLOY_ENVIRONMENT`, `COGNI_REPO_URL` (git-sync), `COGNI_REPO_REF` (git-sync, pinned SHA), `COGNI_REPO_PATH` (app, `/repo/current`), `COGNI_REPO_SHA` (app), `POSTGRES_ROOT_USER`, `POSTGRES_ROOT_PASSWORD`, `APP_DB_USER`, `APP_DB_PASSWORD`, `APP_DB_NAME`, `DATABASE_URL`, `APP_BASE_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`, `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `LITELLM_DATABASE_URL`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASE_URL`, `LANGFUSE_TRACING_ENVIRONMENT` (derived from DEPLOY_ENVIRONMENT), `GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`, `GRAFANA_CLOUD_LOKI_API_KEY`, `METRICS_TOKEN` (app+alloy), `PROMETHEUS_REMOTE_WRITE_URL` (alloy), `PROMETHEUS_USERNAME` (alloy), `PROMETHEUS_PASSWORD` (alloy), `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`, `TEMPORAL_DB_USER`, `TEMPORAL_DB_PASSWORD`, `TEMPORAL_DB_HOST`, `TEMPORAL_DB_PORT`
- **Files considered API:** `docker-compose.yml`, `postgres-init/*.sh`, `configs/alloy-config.alloy`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Provide production runtime configuration copied to VM hosts for deployment (app, postgres, litellm, alloy, temporal). Includes LiteLLM networking + database wiring in dev stack.
- This directory **does not**: Handle TLS termination (see `../edge/`), build-time configuration, or development-only settings

## Usage

**SECURITY WARNING**: This directory is copied to production VMs. Never commit secrets.

```bash
# Production deployment (via deploy script, uses explicit project name)
docker compose --project-name cogni-runtime up -d --remove-orphans

# Database migration (via deploy script, uses db-migrate service)
docker compose --project-name cogni-runtime --profile bootstrap run --rm db-migrate

# View logs
docker compose --project-name cogni-runtime logs -f app
```

## Standards

- All secrets via environment variables (never hardcoded)
- Database initialization scripts must be idempotent
- Production-ready health checks required for all services

## Dependencies

- **Internal:** postgres-init scripts, service configs
- **External:** Docker, PostgreSQL, environment variables from deployment

## Change Protocol

- Update this file when **runtime configuration** changes
- Bump **Last reviewed** date
- Changes affect production deployment - coordinate with operations

## Notes

- **HIGHLY PROTECTED**: This directory is rsync'd to production VMs
- **Edge split**: TLS termination (Caddy) is in separate `../edge/` project to prevent ERR_CONNECTION_RESET during deploys
- **Shared network**: Runtime and edge share `cogni-edge` external network for service DNS resolution
- Database security uses two-user model (root + app credentials)
- Init scripts run only on first postgres container startup
- `NEXTAUTH_URL` env var provided with shell fallback to `APP_BASE_URL`; Auth.js uses `trustHost: true` (safe behind Caddy)
- Log collection: Alloy scrapes Docker containers (JSON stdout), applies strict label cardinality (app, env, service, stream)
- Alloy UI exposed at 127.0.0.1:12345 (internal only)
- `DEPLOY_ENVIRONMENT` must be set (local|preview|production) - used for env label, fail-closed validation
- Single parameterized Alloy config for all environments (no drift)
- `db-migrate` service runs via `--profile bootstrap`, receives only DB env vars (least-secret exposure)
- `MIGRATOR_IMAGE` required in production compose (no fallback), derived from APP_IMAGE with `-migrate` suffix
- `git-sync` runs as bootstrap profile service (prod) or regular service (dev), populates `repo_data` volume at `/repo/current` via atomic symlink
- App reads `COGNI_REPO_PATH=/repo/current` in all environments; `COGNI_REPO_REF` pins to deploy commit SHA
- Dev git-sync clones from `file:///src` (bind-mounted host repo); prod git-sync clones from `COGNI_REPO_URL` at `COGNI_REPO_REF`

**Local Dev (docker-compose.dev.yml):**

- Includes local Loki + Grafana + Caddy services (unified for simplicity)
- Alloy writes to local Loki (http://loki:3100)
- Grafana on http://localhost:3001 (anonymous admin access)
- No cloud credentials needed

**Preview/Production (docker-compose.yml):**

- Caddy runs in separate edge project (see `../edge/`)
- Alloy writes to Grafana Cloud Loki
- Environment variables: `DEPLOY_ENVIRONMENT`, `LOKI_WRITE_URL`, `LOKI_USERNAME`, `LOKI_PASSWORD`
- Metrics: App exposes `/api/metrics` (auth via `METRICS_TOKEN`); Alloy scrapes and ships to Mimir (via `PROMETHEUS_*`)
- Verify in Alloy UI (http://127.0.0.1:12345) and Grafana Cloud

**Temporal Services:**

- `temporal-postgres`: Dedicated Postgres for Temporal (not shared with app DB)
- `temporal`: Temporal server with auto-setup (handles schema migrations), pinned to v1.29.1
- `temporal-ui`: Web UI for debugging schedules (localhost:8233)
- Namespace auto-created via `DEFAULT_NAMESPACE=cogni-{APP_ENV}`
- Port forwarding: 127.0.0.1:7233 (gRPC), 127.0.0.1:8233 (UI)
