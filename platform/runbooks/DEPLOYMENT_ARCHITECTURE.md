# Deployment Architecture Overview

## Goal

Build once. Push to GHCR. Deploy via OpenTofu to Cherry with SSH-based deployment. Gate on HTTPS health validation.

Split between immutable infrastructure (VM) and mutable application deployment.

## Two-Layer Architecture

### Base Infrastructure (`platform/infra/providers/cherry/base/`)

- **Purpose**: VM provisioning with Cherry Servers API
- **Environment separation**: `env.preview.tfvars`, `env.prod.tfvars`
- **Creates**: `preview-cogni`, `prod-cogni` VMs with SSH keys
- **No app secrets**: Only VM topology configuration

### App Deployment (`platform/infra/providers/cherry/app/`)

- **Purpose**: SSH-based container deployment to existing VMs
- **Environment separation**: `env.preview.tfvars`, `env.prod.tfvars`
- **Deploys**: App + LiteLLM + Caddy + Promtail containers
- **Runtime secrets**: From GitHub Environment Secrets → CI env vars

## File Structure

```
platform/infra/providers/cherry/
├── base/                           # VM provisioning
│   ├── main.tf                     # Cherry provider + VM resources
│   ├── variables.tf                # environment, vm_name_prefix, plan, region
│   ├── env.preview.tfvars         # Preview VM config (smaller)
│   └── env.prod.tfvars            # Production VM config
└── app/                            # Container deployment
    ├── main.tf                     # SSH deployment + health gate
    ├── variables.tf                # Secrets vs topology separation
    ├── env.preview.tfvars         # Preview app config
    ├── env.prod.tfvars            # Production app config
    └── files/Caddyfile.tmpl       # Reverse proxy template
```

## Container Stack

**Single image per commit**: `app-${sha}` tagged, reused across environments
**Runtime containers**:

- `app`: Next.js application with environment-specific runtime config
- `litellm`: AI proxy service on `ai.${domain}` subdomain
- `caddy`: HTTPS termination and routing
- `promtail`: Log aggregation

## CI/CD Scripts

Provider-agnostic scripts callable from any CI system:

```bash
platform/ci/scripts/build.sh     # Build linux/amd64 image
platform/ci/scripts/push.sh      # GHCR authentication and push
platform/ci/scripts/deploy.sh    # OpenTofu deployment with env selection
```

## Deployment Flow

### VM Creation (One-time per environment)

```bash
export CHERRY_AUTH_TOKEN=token
tofu apply -var-file=platform/infra/providers/cherry/base/env.preview.tfvars
```

### App Deployment (Repeatable)

```bash
# Set environment and secrets
export DEPLOY_ENVIRONMENT=preview  # or prod
export TF_VAR_app_image=ghcr.io/cogni-dao/cogni-template:app-abc123
export TF_VAR_database_url=postgresql://...
export TF_VAR_ssh_private_key="$(cat ~/.ssh/key)"
export TF_VAR_litellm_master_key=key
export TF_VAR_openrouter_api_key=key

# Deploy
platform/ci/scripts/build.sh && platform/ci/scripts/push.sh
platform/ci/scripts/deploy.sh
```

## Secrets Management

**GitHub Environment Secrets** (preview, production):

- `DATABASE_URL_{PREVIEW,PROD}`
- `SSH_PRIVATE_KEY_{PREVIEW,PROD}`
- `LITELLM_MASTER_KEY_{PREVIEW,PROD}`
- `OPENROUTER_API_KEY_{PREVIEW,PROD}`
- `CHERRY_AUTH_TOKEN`

**Never in tfvars**: All sensitive values come from GitHub secrets → CI env vars → TF variables

## Environment Configuration

**Base Layer** (`env.preview.tfvars`):

```hcl
environment = "preview"
vm_name_prefix = "cogni"
plan = "cloud_vps_1"          # Smaller for preview
project_id = "254586"
region = "LT-Siauliai"
```

**App Layer** (`env.preview.tfvars`):

```hcl
environment = "preview"
domain = "preview.cognidao.org"
host = "preview.vm.ip"         # From base layer output
app_port = 3000
litellm_port = 4000
```

## State Management

**Separate states per environment**: No Terraform workspaces

- Base: `cherry-base-${environment}.tfstate`
- App: `cherry-app-${environment}.tfstate`

**Future remote backend**:

```hcl
backend "s3" {
  key = "cherry-base-${var.environment}.tfstate"
}
```

## Health Validation

1. **Container healthchecks**: Docker HEALTHCHECK in Dockerfile
2. **App health**: `https://${domain}/api/v1/meta/health`
3. **AI health**: `https://ai.${domain}/health/readiness`
4. **Deployment gate**: 5min curl loop validates deployment success

## Current vs Target State

**Current**: Single production VM at `5.199.173.64`
**Target**: Environment-separated VMs:

- Preview: `preview-cogni` (to be created)
- Production: `prod-cogni` (migrate existing)
