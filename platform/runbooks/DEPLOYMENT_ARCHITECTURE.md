# Deployment Architecture Overview

## Goal

Set up VMs once, continuous CI/CD after.

Split between immutable infrastructure (OpenTofu) and mutable application deployment (Docker Compose).

Build once. Push to GHCR. Deploy via GitHub Actions + Docker Compose to Cherry VMs. Gate on HTTPS health validation.

## Three-Layer Architecture

### Base Infrastructure (`platform/infra/providers/cherry/base/`)

- **Purpose**: VM provisioning with Cherry Servers API
- **Environment separation**: `terraform.preview.tfvars`, `terraform.production.tfvars`
- **Creates**: `preview-cogni`, `production-cogni` VMs with SSH deploy keys
- **Authentication**: SSH public keys only, VM host output to GitHub secrets
- **Bootstrap**: Creates `cogni-edge` network, deployment directories

### Edge Infrastructure (`platform/infra/services/edge/`)

- **Purpose**: Always-on TLS termination layer (Caddy)
- **Lifecycle**: Started once at bootstrap, rarely touched
- **Deploys**: Caddy container only via separate compose project
- **Key invariant**: **Never stopped during app deployments** - prevents ERR_CONNECTION_RESET

### App Deployment (`platform/infra/services/runtime/`)

- **Purpose**: Docker Compose stack for mutable app containers
- **Environment separation**: GitHub Environment Secrets
- **Deploys**: App + Postgres + LiteLLM + Alloy containers via `docker-compose.yml`
- **Deployment**: SSH from GitHub Actions, pull-while-running, no `compose down`
- **Network**: Shares `cogni-edge` external network with edge stack

## File Structure

```
platform/infra/
├── providers/cherry/base/          # VM provisioning (OpenTofu only)
│   ├── keys/                       # SSH public keys (committed)
│   │   ├── cogni_preview_deploy.pub
│   │   └── cogni_prod_deploy.pub
│   ├── main.tf                     # Cherry provider + VM resources + outputs
│   ├── variables.tf                # environment, vm_name_prefix, plan, region, public_key_path
│   ├── terraform.preview.tfvars   # Preview VM config (create from example)
│   ├── terraform.production.tfvars # Production VM config (create from example)
│   └── bootstrap.yaml             # Cloud-init VM setup (creates cogni-edge network)
└── services/
    ├── edge/                       # TLS termination (immutable, rarely touched)
    │   ├── docker-compose.yml     # Caddy only
    │   └── configs/
    │       └── Caddyfile.tmpl     # Caddy configuration
    └── runtime/                    # Container stack (mutable, updated each deploy)
        ├── docker-compose.yml     # App + Postgres + LiteLLM + Alloy
        └── configs/               # Service configuration files
            ├── litellm.config.yaml
            └── alloy-config.alloy
    └── sourcecred/                 # SourceCred instance
        ├── docker-compose.sourcecred.yml
        └── instance/               # SourceCred configuration and data
```

## Container Stack

**Environment-specific image tags**: Same IMAGE_NAME, environment-aware tags:

- App image: `preview-${GITHUB_SHA}` or `prod-${GITHUB_SHA}`
- Migrator image: `preview-${GITHUB_SHA}-migrate` or `prod-${GITHUB_SHA}-migrate`

**Edge containers** (project: `cogni-edge`, rarely touched):

- `caddy`: HTTPS termination and routing - **never stopped during app deploys**

**Runtime containers** (project: `cogni-runtime`, updated each deploy):

- `app`: Next.js application with environment-specific runtime config (lean, no migration tools)
- `postgres`: Database server
- `litellm`: AI proxy service
- `alloy`: Log collection and forwarding
- `db-provision`: Database user/schema provisioning (bootstrap profile)
- `db-migrate`: Database migrations via dedicated migrator image (bootstrap profile)
- `sourcecred`: Cred analysis and UI (separate compose project, shares network)
  > **Note**: SourceCred uses an immutable runner image. To update runtime version:
  >
  > 1. Run: `./platform/infra/services/sourcecred/release.sh sc<VER>-node<VER>-<DATE>`
  >    (Example: `./platform/infra/services/sourcecred/release.sh sc0.11.2-node18-2025-12-07`)
  > 2. Invariant: Requires `docker login ghcr.io` with push access.
  > 3. Update `docker-compose.sourcecred.yml` to use the new tag.
  >    - Package: https://github.com/orgs/Cogni-DAO/packages/container/package/cogni-sourcecred-runner
  >    - Pull: `docker pull ghcr.io/cogni-dao/cogni-sourcecred-runner:sc0.11.2-node18-2025-12-07`

**Registry Authentication**:

For private GHCR images, VMs authenticate using bot account credentials:

- **Manual setup required**: Create GitHub PAT for `Cogni-1729` (our bot, you'll need your own) with `read:packages` scope
- **Environment secrets**: `GHCR_DEPLOY_TOKEN` (PAT), `GHCR_USERNAME=Cogni-1729`
- **Deploy flow**: CI injects `docker login ghcr.io` before `docker compose pull`

## GitHub Actions Workflows

See [CI-CD.md](../../docs/CI-CD.md) for complete workflow documentation.

**Key workflows:**

- `staging-preview.yml` - Push to staging: build → test → push → deploy → e2e → auto-promote
- `build-prod.yml` - Push to main: build → test → push
- `deploy-production.yml` - Triggered on build-prod success: deploy to production

## Getting Started

**First-time setup / Disaster recovery**: See [INFRASTRUCTURE_SETUP.md](INFRASTRUCTURE_SETUP.md)

## Deployment Flows

**VM Provisioning (One-time)**: Manual via OpenTofu (see INFRASTRUCTURE_SETUP.md)
**App Deployment (Routine)**: Auto-triggered on staging/main → rsync bundle → SSH → `docker compose up`

## Secrets Management

**GitHub Secrets** (clean naming):

- **Repository secrets**: `GHCR_DEPLOY_TOKEN`, `CHERRY_AUTH_TOKEN`, `SONAR_TOKEN` (shared across environments)
- **Environment secrets** (`preview`/`production`): `POSTGRES_ROOT_USER`, `POSTGRES_ROOT_PASSWORD`, `APP_DB_USER`, `APP_DB_PASSWORD`, `APP_DB_NAME`, `DATABASE_URL`, `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `AUTH_SECRET`, `SSH_DEPLOY_KEY`, `VM_HOST`, `DOMAIN`

**CI-Generated Variables**:

- `APP_IMAGE`: Derived from `IMAGE_NAME:IMAGE_TAG`
- `MIGRATOR_IMAGE`: Derived from `IMAGE_NAME:IMAGE_TAG-migrate` (tag coupling invariant)

**Private Registry Access**: `GHCR_DEPLOY_TOKEN` enables pulling private images from GitHub Container Registry using `Cogni-1729` bot account.

**SSH Security**: Private keys never in Terraform state. SSH agent authentication only.
**Deployment**: Github Actions and Docker Compose for app deployment. Faster, simpler rollbacks.

## Database Security Model

**Two-User Architecture**: Separates database administration from application access:

- **Root User** (`POSTGRES_ROOT_USER`): Creates databases and users, not used by application
- **App User** (`APP_DB_USER`): Limited to application database, used by runtime containers

**Initialization**: `postgres-init/01-init-app-db.sh` script runs on first container start to create application database and user with proper permissions.

**Environment Variable Mapping**:

```bash
# Container postgres service
POSTGRES_USER=${POSTGRES_ROOT_USER}      # Container's POSTGRES_USER
POSTGRES_PASSWORD=${POSTGRES_ROOT_PASSWORD}
POSTGRES_DB=postgres                      # Default database for user creation

# Application service
POSTGRES_USER=${APP_DB_USER}             # App's POSTGRES_USER
POSTGRES_PASSWORD=${APP_DB_PASSWORD}
POSTGRES_DB=${APP_DB_NAME}
```

## Environment Configuration

**Base Layer**: VM topology in `env.{preview,prod}.tfvars`  
**Runtime**: Environment secrets → Docker Compose `.env` on VM

## State Management

**Terraform state**: Only for base infrastructure (VMs)

- Base: `cherry-base-${environment}.tfstate`
- App: No Terraform state (Docker Compose managed)

## Health Validation

1. **Container healthchecks**: Docker HEALTHCHECK uses `/readyz` (full validation)
2. **Deployment readiness**: `https://${domain}/readyz` successful curl (hard gate)
3. **Liveness probe**: `/livez` available for fast boot verification

## Current State

**Live**: Production VM with automated deployment pipeline
**Available**: Preview environment ready for provisioning via GitHub Actions

---

## Related Documentation

- [CI/CD Pipeline Flow](../../docs/CI-CD.md) - Branch model, workflows, and deployment automation
- [Infrastructure Setup](INFRASTRUCTURE_SETUP.md) - VM provisioning and disaster recovery
- [Application Architecture](../../docs/ARCHITECTURE.md) - Hexagonal design and code organization
