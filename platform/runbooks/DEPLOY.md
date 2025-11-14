# Quick Deploy Guide

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
tofu init && tofu apply -var-file=env.preview.tfvars
```

## 3. Manual Deploy Test

```bash
# Add SSH key to agent
ssh-add ~/.ssh/cogni_template_preview_deploy

# Build and Push to GHCR
platform/ci/scripts/build.sh && platform/ci/scripts/push.sh

# Set environment variables
export DEPLOY_ENVIRONMENT=preview
export APP_IMAGE=ghcr.io/cogni-dao/cogni-template:app-abc123
export DOMAIN=preview.cognidao.org
export VM_HOST=your-vm-ip
export DATABASE_URL=postgresql://...
export LITELLM_MASTER_KEY=sk-...
export OPENROUTER_API_KEY=sk-...

# Deploy
platform/ci/scripts/deploy.sh
```

## 4. Enable GitHub Actions

Set SSH deploy keys (requires GitHub admin auth):

```bash
# Preview environment
gh secret set SSH_DEPLOY_KEY --env preview --body "$(cat ~/.ssh/cogni_template_preview_deploy)"

# Production environment
gh secret set SSH_DEPLOY_KEY --env production --body "$(cat ~/.ssh/cogni_template_production_deploy)"
```

Also add to GitHub Environment Secrets:

- `DATABASE_URL`, `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `DOMAIN`
- `VM_HOST` = auto-populated by base infrastructure workflow

Now PRs auto-deploy to preview environment.
