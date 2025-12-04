# Deployment Architecture Overview

## Goal

Set up VMs once, continuous CI/CD after.

Split between immutable infrastructure (OpenTofu) and mutable application deployment (Docker Compose).

Build once. Push to GHCR. Deploy via GitHub Actions + Docker Compose to Cherry VMs. Gate on HTTPS health validation.

## Three-Layer Architecture

### Base Infrastructure (`platform/infra/providers/cherry/base/`)

- **Purpose**: VM provisioning with Cherry Servers API
- **Environment separation**: `env.preview.tfvars`, `env.prod.tfvars`
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
│   ├── env.preview.tfvars         # Preview VM config
│   ├── env.prod.tfvars            # Production VM config
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

**Registry Authentication**:

For private GHCR images, VMs authenticate using bot account credentials:

- **Manual setup required**: Create GitHub PAT for `Cogni-1729` (our bot, you'll need your own) with `read:packages` scope
- **Environment secrets**: `GHCR_DEPLOY_TOKEN` (PAT), `GHCR_USERNAME=Cogni-1729`
- **Deploy flow**: CI injects `docker login ghcr.io` before `docker compose pull`

## GitHub Actions Workflows (Primary Interface)

**Build & Test Pipeline:**

- `ci.yaml` - Static checks (lint, type, REUSE) on all PRs
- `build-preview.yml` - Docker build + health tests (triggered by app changes)
- `build-prod.yml` - Docker build + health tests for production

**Deployment Pipeline:**

- `deploy-preview.yml` - **Auto-triggered on PR**: Build + Push + Deploy (consolidated workflow)
- `deploy-production.yml` - **Auto-triggered on main**: Build → Push GHCR → SSH → Docker Compose
- `provision-base.yml` - **Manual VM provisioning** via OpenTofu workflow dispatch

**End-to-End Testing:**

- `e2e-test-preview.yml` - Runs after preview deployment completes

## Getting Started

**First-time setup**: See [DEPLOY.md](DEPLOY.md) for step-by-step guide.

## Deployment Flows

**VM Provisioning (One-time)**: GitHub Actions "Provision Base Infrastructure" workflow  
**App Deployment (Routine)**: Auto-triggered on PR/main → rsync bundle → SSH → `docker compose up`

**Manual deployments**: See [DEPLOY.md](DEPLOY.md)

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

1. **Container healthchecks**: Docker HEALTHCHECK in Dockerfile
2. **App health**: `https://${domain}/health` successful curl

## Current State

**Live**: Production VM with automated deployment pipeline
**Available**: Preview environment ready for provisioning via GitHub Actions

---

## Related Documentation

- [CI/CD Pipeline Flow](../../docs/CI-CD.md) - Branch model, workflows, and deployment automation
- [Application Architecture](../../docs/ARCHITECTURE.md) - Hexagonal design and code organization
- [DEPLOY.md](DEPLOY.md) - Step-by-step deployment guide
