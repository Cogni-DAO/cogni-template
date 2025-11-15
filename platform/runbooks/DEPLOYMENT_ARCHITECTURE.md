# Deployment Architecture Overview

## Goal

Set up VMs once, continuous CI/CD after.

Split between immutable infrastructure (OpenTofu) and mutable application deployment (Docker Compose).

Build once. Push to GHCR. Deploy via GitHub Actions + Docker Compose to Cherry VMs. Gate on HTTPS health validation.

## Two-Layer Architecture

### Base Infrastructure (`platform/infra/providers/cherry/base/`)

- **Purpose**: VM provisioning with Cherry Servers API
- **Environment separation**: `env.preview.tfvars`, `env.prod.tfvars`
- **Creates**: `preview-cogni`, `production-cogni` VMs with SSH deploy keys
- **Authentication**: SSH public keys only, VM host output to GitHub secrets

### App Deployment (`platform/infra/services/runtime/`)

- **Purpose**: Docker Compose stack for container deployment to existing VMs
- **Environment separation**: GitHub Environment Secrets
- **Deploys**: App + LiteLLM + Caddy + Promtail containers via `docker-compose.yml`
- **Deployment**: SSH from GitHub Actions (no Terraform for app layer)

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
│   └── bootstrap.yaml             # Cloud-init VM setup
└── services/runtime/               # Container stack (Docker Compose)
    ├── docker-compose.yml         # App + LiteLLM + Caddy + Promtail
    └── configs/                   # Service configuration files
        ├── Caddyfile.tmpl         # (mounted as ./configs/Caddyfile.tmpl)
        ├── promtail-config.yaml   # (mounted as ./configs/promtail-config.yaml)
        └── litellm.config.yaml    # (mounted as ./configs/litellm.config.yaml)
```

## Container Stack

**Environment-specific image tags**: Same IMAGE_NAME, environment-aware tags:

- Preview: `preview-${GITHUB_SHA}`
- Production: `prod-${GITHUB_SHA}`
  **Runtime containers**:

- `app`: Next.js application with environment-specific runtime config
- `litellm`: AI proxy service on `ai.${domain}` subdomain
- `caddy`: HTTPS termination and routing
- `promtail`: Log aggregation

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

**GitHub Environment Secrets** (clean naming):

- **`preview`/`production`**: `DATABASE_URL`, `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `SSH_DEPLOY_KEY`, `VM_HOST`, `DOMAIN`
- **`cherry-base`**: `CHERRY_AUTH_TOKEN` (isolated from app deployments)

**SSH Security**: Private keys never in Terraform state. SSH agent authentication only.
**Deployment**: Github Actions and Docker Compose for app deployment. Faster, simpler rollbacks.

## Environment Configuration

**Base Layer**: VM topology in `env.{preview,prod}.tfvars`  
**Runtime**: Environment secrets → Docker Compose `.env` on VM

## State Management

**Terraform state**: Only for base infrastructure (VMs)

- Base: `cherry-base-${environment}.tfstate`
- App: No Terraform state (Docker Compose managed)

## Health Validation

1. **Container healthchecks**: Docker HEALTHCHECK in Dockerfile
2. **App health**: `https://${domain}/api/v1/meta/health` successful curl

## Current State

**Live**: Production VM with automated deployment pipeline
**Available**: Preview environment ready for provisioning via GitHub Actions
