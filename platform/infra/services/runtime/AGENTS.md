# runtime · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-01
- **Status:** draft

## Purpose

Production runtime configuration directory copied to VM hosts for container orchestration and database initialization.

## Pointers

- [docker-compose.yml](docker-compose.yml): Production container stack
- [docker-compose.dev.yml](docker-compose.dev.yml): Development container stack
- [postgres-init/](postgres-init/): Database initialization scripts
- [configs/](configs/): Service configuration templates
- [docker-daemon.json](docker-daemon.json): Docker daemon log limits (reference only, applied via bootstrap.yaml)

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
- **Env/Config keys:** `APP_ENV`, `POSTGRES_ROOT_USER`, `POSTGRES_ROOT_PASSWORD`, `APP_DB_USER`, `APP_DB_PASSWORD`, `APP_DB_NAME`, `DATABASE_URL`, `APP_BASE_URL`, `NEXTAUTH_URL`, `AUTH_SECRET`, `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `LITELLM_DATABASE_URL`, `GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`, `GRAFANA_CLOUD_LOKI_API_KEY`
- **Files considered API:** `docker-compose.yml`, `postgres-init/*.sh`, `configs/alloy-config.alloy`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Provide production runtime configuration copied to VM hosts for deployment (including LiteLLM networking + database wiring in dev stack)
- This directory **does not**: Handle build-time configuration or development-only settings

## Usage

**SECURITY WARNING**: This directory is copied to production VMs. Never commit secrets.

```bash
# Production deployment (via deploy script)
docker compose --env-file .env up -d --remove-orphans

# Database migration (via deploy script)
docker compose run --rm --entrypoint sh app -lc 'pnpm db:migrate:container'
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
- Database security uses two-user model (root + app credentials)
- Init scripts run only on first postgres container startup
- `NEXTAUTH_URL` env var provided with shell fallback to `APP_BASE_URL`; Auth.js uses `trustHost: true` (safe behind Caddy)
- Log collection: Alloy scrapes Docker containers, applies strict label cardinality (app, env, service, stream), sends to Grafana Cloud Loki
- Alloy UI exposed at 127.0.0.1:12345 (internal only)
- `APP_ENV` must be set (test|production) - used for log labeling

**Grafana Cloud Setup:**

1. Sign up at https://grafana.com/products/cloud/ (free tier available)
2. Get Loki credentials: Grafana Cloud → Connections → Data Sources → Loki
3. Set environment variables in deployment:
   - `GRAFANA_CLOUD_LOKI_URL` - Push endpoint URL
   - `GRAFANA_CLOUD_LOKI_USER` - Numeric user ID
   - `GRAFANA_CLOUD_LOKI_API_KEY` - API key with logs:write permission
4. Verify in Alloy UI (http://127.0.0.1:12345) after deployment
