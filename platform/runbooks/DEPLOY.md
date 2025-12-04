# Quick Deploy Guide

Manual deployment process for testing. For automated setup design, see [SETUP_DESIGN.md](../../scripts/setup/SETUP_DESIGN.md).

(Note: guide needs full walkthrough + review still. 90% accurate)

## 1. Generate SSH Deploy Key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/cogni_template_preview_deploy -C "cogni-template-preview-deploy"
cp ~/.ssh/cogni_template_preview_deploy.pub platform/infra/providers/cherry/base/keys/
git add platform/infra/providers/cherry/base/keys/cogni_template_preview_deploy.pub && git commit -m "Add preview deploy key"
```

## 2. Provision VM (OpenTofu)

```bash
cd platform/infra/providers/cherry/base
export CHERRY_AUTH_TOKEN=your-cherry-token
tofu init
# IMPORTANT: Use workspaces to separate environments
tofu workspace select preview  # or 'tofu workspace new preview' first time
tofu apply -var-file=env.preview.tfvars
```

**OpenTofu Workspace Safety**: Always check `tofu workspace show` before apply. Each workspace manages separate VMs - preview, production, test, etc.

## 3. Database Configuration

The deployment uses a two-user PostgreSQL security model:

- **Root user**: Database administration (creates app user/database)
- **App user**: Application connections (limited privileges)

Generate secure passwords:

```bash
# Root password (hex, safe for SQL + URLs)
export POSTGRES_ROOT_PASSWORD_PREVIEW="$(openssl rand -hex 32)"

# App password (hex, safe for SQL + URLs)
export APP_DB_PASSWORD_PREVIEW="$(openssl rand -hex 32)"

echo "Root password: $POSTGRES_ROOT_PASSWORD_PREVIEW"
echo "App password:  $APP_DB_PASSWORD_PREVIEW"
```

For database architecture details, see [DATABASES.md](../../docs/DATABASES.md).

## 4. Manual Deploy Test

```bash
# Add SSH key to agent
ssh-add ~/.ssh/cogni_template_preview_deploy

# Build, Test, and Push to GHCR
export IMAGE_NAME=ghcr.io/cogni-dao/cogni-template
export IMAGE_TAG=preview-local-$(git rev-parse --short HEAD)
platform/ci/scripts/build.sh && \
  platform/ci/scripts/test-image.sh && \
  platform/ci/scripts/push.sh

# Set all environment variables
export DEPLOY_ENVIRONMENT=preview
export APP_ENV=production
export APP_IMAGE=$IMAGE_NAME:$IMAGE_TAG
export DOMAIN=preview.cognidao.org
export VM_HOST=your-vm-ip
export DATABASE_URL="postgresql://cogni_app_preview:$APP_DB_PASSWORD_PREVIEW@postgres:5432/cogni_template_preview"
export LITELLM_MASTER_KEY=sk-...
export OPENROUTER_API_KEY=sk-...
export AUTH_SECRET=your-session-secret
export POSTGRES_ROOT_USER=postgres
export POSTGRES_ROOT_PASSWORD=$POSTGRES_ROOT_PASSWORD_PREVIEW
export APP_DB_USER=cogni_app_preview
export APP_DB_PASSWORD=$APP_DB_PASSWORD_PREVIEW
export APP_DB_NAME=cogni_template_preview
export SSH_KEY_PATH=~/.ssh/cogni_template_preview_deploy

# Deploy
platform/ci/scripts/deploy.sh
```

## 5. Enable GitHub Actions

Set SSH deploy keys (requires GitHub admin auth):

```bash
# Preview environment
gh secret set SSH_DEPLOY_KEY --env preview --body "$(cat ~/.ssh/cogni_template_preview_deploy)"

# Production environment
gh secret set SSH_DEPLOY_KEY --env production --body "$(cat ~/.ssh/cogni_template_production_deploy)"
```

Add database secrets to GitHub Environment:

```bash
# Preview environment database secrets
gh secret set POSTGRES_ROOT_USER --env preview --body "postgres"
gh secret set POSTGRES_ROOT_PASSWORD --env preview --body "$POSTGRES_ROOT_PASSWORD_PREVIEW"
gh secret set APP_DB_USER --env preview --body "cogni_app_preview"
gh secret set APP_DB_PASSWORD --env preview --body "$APP_DB_PASSWORD_PREVIEW"
gh secret set APP_DB_NAME --env preview --body "cogni_template_preview"
gh secret set DATABASE_URL --env preview --body "postgresql://cogni_app_preview:$APP_DB_PASSWORD_PREVIEW@postgres:5432/cogni_template_preview"
```

Also add service secrets:

- `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `AUTH_SECRET`, `DOMAIN`
- `VM_HOST` = auto-populated by base infrastructure workflow

For complete secrets list, see [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md).

Now PRs auto-deploy to preview environment.

## 6. Verify Database Setup

After successful deployment, verify the database was created correctly:

```bash
ssh -i ~/.ssh/cogni_template_preview_deploy root@your-vm-ip

# Check database was created
cd /opt/cogni-template-runtime && docker compose exec -T postgres psql -U postgres -d postgres -c "\l+"

# Test migration works (uses db-migrate service with MIGRATOR_IMAGE)
cd /opt/cogni-template-runtime && docker compose --profile bootstrap run --rm db-migrate
```

Expected: Database `cogni_template_preview` exists owned by `cogni_app_preview`, migrations succeed without auth errors.
