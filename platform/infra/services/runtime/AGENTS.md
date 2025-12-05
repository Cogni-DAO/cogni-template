# runtime · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-06
- **Status:** draft

## Purpose

Production runtime configuration directory copied to VM hosts for container orchestration and database initialization. Contains app + postgres + litellm + alloy services. Edge (Caddy) is in separate `../edge/` project.

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
- **Env/Config keys:** `APP_IMAGE`, `MIGRATOR_IMAGE`, `APP_ENV`, `POSTGRES_ROOT_USER`, `POSTGRES_ROOT_PASSWORD`, `APP_DB_USER`, `APP_DB_PASSWORD`, `APP_DB_NAME`, `DATABASE_URL`, `APP_BASE_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`, `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `DEFAULT_MODEL`, `LITELLM_DATABASE_URL`, `GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`, `GRAFANA_CLOUD_LOKI_API_KEY`, `METRICS_TOKEN` (app+alloy), `PROMETHEUS_REMOTE_WRITE_URL` (alloy), `PROMETHEUS_USERNAME` (alloy), `PROMETHEUS_PASSWORD` (alloy)
- **Files considered API:** `docker-compose.yml`, `postgres-init/*.sh`, `configs/alloy-config.alloy`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Provide production runtime configuration copied to VM hosts for deployment (app, postgres, litellm, alloy). Includes LiteLLM networking + database wiring in dev stack.
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
