# Infrastructure Setup

Complete guide for provisioning VMs, configuring DNS, and setting up GitHub secrets for preview and production environments.

**When to use this guide:**

- First-time deployment setup
- Disaster recovery (VMs deleted/terminated)
- Adding a new environment

## Prerequisites

- Cherry Servers account with API token ([portal.cherryservers.com](https://portal.cherryservers.com))
- GitHub CLI authenticated (`gh auth login`)
- OpenTofu installed (`platform/bootstrap/install/install-tofu.sh`)
- Domain access (Namecheap or your registrar)

## Quick Reference

| Environment | Domain               | SSH Key                                     | GitHub Environment |
| ----------- | -------------------- | ------------------------------------------- | ------------------ |
| Preview     | preview.cognidao.org | `keys/cogni_template_preview_deploy.pub`    | `preview`          |
| Production  | cognidao.org         | `keys/cogni_template_production_deploy.pub` | `production`       |

---

## Step 1: Generate SSH Deploy Keys

Generate ed25519 keypairs for each environment. These keys allow CI to SSH into VMs for deployment.

```bash
cd platform/infra/providers/cherry/base
```

### Preview Key

```bash
# Generate keypair (no passphrase for CI automation)
ssh-keygen -t ed25519 -f ~/.ssh/cogni_template_preview_deploy -C "cogni-template-preview" -N ""

# Copy public key to repo
cp ~/.ssh/cogni_template_preview_deploy.pub keys/

# Upload private key to GitHub Secrets immediately
gh secret set SSH_DEPLOY_KEY --env preview --body "$(cat ~/.ssh/cogni_template_preview_deploy)"
```

### Production Key

```bash
# Generate keypair
ssh-keygen -t ed25519 -f ~/.ssh/cogni_template_production_deploy -C "cogni-template-production" -N ""

# Copy public key to repo
cp ~/.ssh/cogni_template_production_deploy.pub keys/

# Upload private key to GitHub Secrets immediately
gh secret set SSH_DEPLOY_KEY --env production --body "$(cat ~/.ssh/cogni_template_production_deploy)"
```

### Commit Public Keys & Cleanup

```bash
git add keys/*.pub
git commit -m "chore(infra): add SSH deploy keys for preview and production"
git push

# Optional: delete local private keys (now stored in GitHub Secrets)
rm ~/.ssh/cogni_template_preview_deploy ~/.ssh/cogni_template_production_deploy
```

---

## Step 2: Set Credentials

```bash
# Cherry API token (from portal.cherryservers.com → Settings → API Keys)
export CHERRY_AUTH_TOKEN="<your-token>"

# Get project ID from Cherry portal URL or project settings
export CHERRY_PROJECT_ID="<your-project-id>"
```

---

## Step 3: Provision VMs

> **Important**: Each environment has its own SSH keypair. The `TF_VAR_ssh_private_key` variable must match the public key in your tfvars file. If mismatched, the health check will fail with "SSH authentication failed".

### Preview Environment

```bash
# Set private key for health check (must match public_key_path in tfvars)
export TF_VAR_ssh_private_key="$(cat ~/.ssh/cogni_template_preview_deploy)"

# Create tfvars file
cat > terraform.preview.tfvars << EOF
environment     = "preview"
vm_name_prefix  = "cogni-template"
project_id      = "${CHERRY_PROJECT_ID}"
plan            = "B1-2-2gb-40s-shared"
region          = "LT-Siauliai"
public_key_path = "keys/cogni_template_preview_deploy.pub"
EOF

# Initialize and create workspace
tofu init
tofu workspace new preview || tofu workspace select preview

# Provision VM
tofu plan -var-file=terraform.preview.tfvars
tofu apply -var-file=terraform.preview.tfvars

# Save the IP
export PREVIEW_IP=$(tofu output -raw vm_host)
echo "Preview VM IP: $PREVIEW_IP"
```

### Production Environment

```bash
# Set private key for health check (must match public_key_path in tfvars)
export TF_VAR_ssh_private_key="$(cat ~/.ssh/cogni_template_production_deploy)"

# Create tfvars file
cat > terraform.production.tfvars << EOF
environment     = "production"
vm_name_prefix  = "cogni-template"
project_id      = "${CHERRY_PROJECT_ID}"
plan            = "B1-2-2gb-40s-shared"
region          = "LT-Siauliai"
public_key_path = "keys/cogni_template_production_deploy.pub"
EOF

# Switch workspace
tofu workspace new production || tofu workspace select production

# Provision VM
tofu plan -var-file=terraform.production.tfvars
tofu apply -var-file=terraform.production.tfvars

# Save the IP
export PROD_IP=$(tofu output -raw vm_host)
echo "Production VM IP: $PROD_IP"
```

---

## Step 4: Configure DNS

Update A records at your domain registrar (e.g., Namecheap → Advanced DNS):

| Host      | Type | Value         | TTL       |
| --------- | ---- | ------------- | --------- |
| `preview` | A    | `$PREVIEW_IP` | Automatic |
| `@`       | A    | `$PROD_IP`    | Automatic |
| `www`     | A    | `$PROD_IP`    | Automatic |

**Verify propagation** (may take 5-15 minutes):

```bash
dig +short preview.cognidao.org
dig +short cognidao.org
```

---

## Step 5: Update GitHub Secrets

### VM Host IPs

```bash
gh secret set VM_HOST --env preview --body "$PREVIEW_IP"
gh secret set VM_HOST --env production --body "$PROD_IP"
```

### Required Secrets Per Environment

Both `preview` and `production` environments need these secrets. Generate fresh values for each environment:

```bash
# Set environment (run this section twice: once for preview, once for production)
ENV="preview"  # or "production"

# Database credentials (generate unique per environment)
gh secret set POSTGRES_ROOT_USER --env $ENV --body "postgres"
gh secret set POSTGRES_ROOT_PASSWORD --env $ENV --body "$(openssl rand -hex 32)"
gh secret set APP_DB_USER --env $ENV --body "app_user"
gh secret set APP_DB_PASSWORD --env $ENV --body "$(openssl rand -hex 32)"
gh secret set APP_DB_SERVICE_USER --env $ENV --body "app_service"
gh secret set APP_DB_SERVICE_PASSWORD --env $ENV --body "$(openssl rand -hex 32)"
gh secret set APP_DB_NAME --env $ENV --body "cogni_template_${ENV}"

# Construct DATABASE_URL (app_user role, RLS enforced):
# postgresql://app_user:<APP_DB_PASSWORD>@postgres:5432/cogni_template_${ENV}
gh secret set DATABASE_URL --env $ENV --body "<constructed-url>"

# Construct DATABASE_SERVICE_URL (app_service role, BYPASSRLS):
# postgresql://app_service:<APP_DB_SERVICE_PASSWORD>@postgres:5432/cogni_template_${ENV}
gh secret set DATABASE_SERVICE_URL --env $ENV --body "<constructed-service-url>"

# Service secrets
gh secret set AUTH_SECRET --env $ENV --body "$(openssl rand -hex 32)"
gh secret set LITELLM_MASTER_KEY --env $ENV --body "sk-$(openssl rand -hex 24)"
gh secret set METRICS_TOKEN --env $ENV --body "$(openssl rand -base64 32)"

# Domain
gh secret set DOMAIN --env $ENV --body "preview.cognidao.org"  # or "cognidao.org" for production

# API keys (same value can be shared across environments, or use separate keys)
gh secret set OPENROUTER_API_KEY --env $ENV --body "<your-openrouter-key>"
gh secret set EVM_RPC_URL --env $ENV --body "<your-rpc-url>"
gh secret set SOURCECRED_GITHUB_TOKEN --env $ENV --body "<github-pat-for-sourcecred>"
```

> **Note**: `SSH_DEPLOY_KEY` was already set in Step 1.

### Repository Secrets (Shared)

These are set once at repository level, not per-environment:

```bash
gh secret set CHERRY_AUTH_TOKEN --body "<cherry-api-token>"
gh secret set GHCR_DEPLOY_TOKEN --body "<github-pat-with-packages-read>"
gh secret set SONAR_TOKEN --body "<sonarcloud-token>"
gh secret set ACTIONS_AUTOMATION_BOT_PAT --body "<bot-pat>"
gh secret set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID --body "<walletconnect-project-id>"
```

### Optional: Grafana Cloud Observability

```bash
gh secret set GRAFANA_CLOUD_LOKI_URL --env $ENV --body "<loki-push-url>"
gh secret set GRAFANA_CLOUD_LOKI_USER --env $ENV --body "<loki-user-id>"
gh secret set GRAFANA_CLOUD_LOKI_API_KEY --env $ENV --body "<loki-api-key>"
gh secret set PROMETHEUS_REMOTE_WRITE_URL --env $ENV --body "<prometheus-url>"
gh secret set PROMETHEUS_USERNAME --env $ENV --body "<prometheus-user>"
gh secret set PROMETHEUS_PASSWORD --env $ENV --body "<prometheus-password>"
```

---

## Step 6: Verify Setup

Deployments are triggered automatically by CI:

- **Preview**: Push to `staging` branch triggers `staging-preview.yml`
- **Production**: Push to `main` branch triggers `deploy-production.yml`

### Manual Verification

After CI deploys, verify:

```bash
# Check HTTPS and health endpoints
curl -I https://preview.cognidao.org/readyz
curl -I https://cognidao.org/readyz

# SSH into VMs if needed
ssh -i ~/.ssh/cogni_template_preview_deploy root@$PREVIEW_IP
ssh -i ~/.ssh/cogni_template_production_deploy root@$PROD_IP
```

---

## SSH Reference

Quick commands for admin access to VMs.

### Connect to VMs

```bash
# Preview
ssh -i ~/.ssh/cogni_template_preview_deploy root@<PREVIEW_IP>

# Production
ssh -i ~/.ssh/cogni_template_production_deploy root@<PROD_IP>
```

> **Tip**: Get current IPs from GitHub Secrets or `tofu output -raw vm_host` in the appropriate workspace.

### Docker Compose Locations (on VM)

| Stack                            | Path                                             | Project Name    |
| -------------------------------- | ------------------------------------------------ | --------------- |
| Edge (Caddy/TLS)                 | `/opt/cogni-template-edge/docker-compose.yml`    | `cogni-edge`    |
| Runtime (app, postgres, litellm) | `/opt/cogni-template-runtime/docker-compose.yml` | `cogni-runtime` |

```bash
# Example: view runtime logs
docker compose --project-name cogni-runtime -f /opt/cogni-template-runtime/docker-compose.yml logs --tail 100

# Example: restart edge stack
docker compose --project-name cogni-edge -f /opt/cogni-template-edge/docker-compose.yml restart
```

---

## Troubleshooting

### Certificate Errors (SSL mismatch)

**Symptom**: Browser shows certificate for wrong domain (e.g., `cloudflare-dns.com`)

**Cause**: VM was terminated and IP reassigned, or Caddy failed to obtain certificate

**Fix**: Re-provision VM (Step 2), update DNS (Step 3), update GitHub secrets (Step 4)

### Health Check Fails: "SSH authentication failed"

**Symptom**: `tofu apply` times out with `ssh: unable to authenticate, attempted methods [none publickey]`

**Cause**: `TF_VAR_ssh_private_key` doesn't match the public key on the VM. Common when switching between preview/production.

**Fix**:

```bash
# Ensure private key matches the environment you're provisioning
export TF_VAR_ssh_private_key="$(cat ~/.ssh/cogni_template_preview_deploy)"    # for preview
export TF_VAR_ssh_private_key="$(cat ~/.ssh/cogni_template_production_deploy)" # for production

# Re-run apply
tofu apply -var-file=terraform.<environment>.tfvars
```

### SSH Connection Failed

```bash
# Verify key exists
ls -la ~/.ssh/cogni_template_*_deploy

# Test connection
ssh -i ~/.ssh/cogni_template_preview_deploy root@$PREVIEW_IP echo "OK"

# If key doesn't exist, regenerate:
ssh-keygen -t ed25519 -f ~/.ssh/cogni_template_preview_deploy -C "cogni-template-preview"
# Then update keys/ directory and GitHub secrets
```

### Deployment Fails at Health Check

```bash
# SSH into VM and check containers
ssh -i ~/.ssh/cogni_template_preview_deploy root@$PREVIEW_IP

# On VM:
docker ps -a
docker compose --project-name cogni-edge -f /opt/cogni-template-edge/docker-compose.yml logs caddy
docker compose --project-name cogni-runtime -f /opt/cogni-template-runtime/docker-compose.yml logs app
```

### DNS Not Propagating

```bash
# Check current resolution
dig +trace preview.cognidao.org

# Force refresh (may need to wait or clear DNS cache)
# On macOS:
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
```

---

## Reference: Complete Secrets Checklist

### Per-Environment Secrets

| Secret                    | Description                 | How to Generate                                         |
| ------------------------- | --------------------------- | ------------------------------------------------------- |
| `VM_HOST`                 | VM IP address               | From `tofu output`                                      |
| `DOMAIN`                  | Environment domain          | `preview.cognidao.org` or `cognidao.org`                |
| `SSH_DEPLOY_KEY`          | Private SSH key             | `cat ~/.ssh/cogni_template_*_deploy`                    |
| `POSTGRES_ROOT_USER`      | DB root user                | `postgres`                                              |
| `POSTGRES_ROOT_PASSWORD`  | DB root password            | `openssl rand -hex 32`                                  |
| `APP_DB_USER`             | App DB user (RLS enforced)  | `app_user`                                              |
| `APP_DB_PASSWORD`         | App DB password             | `openssl rand -hex 32`                                  |
| `APP_DB_SERVICE_USER`     | Service DB user (BYPASSRLS) | `app_service`                                           |
| `APP_DB_SERVICE_PASSWORD` | Service DB password         | `openssl rand -hex 32`                                  |
| `APP_DB_NAME`             | App database name           | `cogni_template_preview` or `cogni_template_production` |
| `DATABASE_URL`            | Full connection string      | Constructed from above (uses APP_DB_USER)               |
| `DATABASE_SERVICE_URL`    | Service connection string   | Constructed from above (uses APP_DB_SERVICE_USER)       |
| `AUTH_SECRET`             | NextAuth secret             | `openssl rand -hex 32`                                  |
| `LITELLM_MASTER_KEY`      | LiteLLM API key             | `sk-$(openssl rand -hex 24)`                            |
| `METRICS_TOKEN`           | Metrics auth token          | `openssl rand -base64 32`                               |
| `OPENROUTER_API_KEY`      | OpenRouter API key          | From openrouter.ai                                      |
| `EVM_RPC_URL`             | Ethereum RPC URL            | From Alchemy/Infura                                     |
| `SOURCECRED_GITHUB_TOKEN` | GitHub PAT for SourceCred   | GitHub PAT with repo read                               |

### Repository Secrets

| Secret                                 | Description                     |
| -------------------------------------- | ------------------------------- |
| `CHERRY_AUTH_TOKEN`                    | Cherry Servers API token        |
| `GHCR_DEPLOY_TOKEN`                    | GitHub PAT with `read:packages` |
| `SONAR_TOKEN`                          | SonarCloud token                |
| `ACTIONS_AUTOMATION_BOT_PAT`           | Bot PAT for automation          |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID        |

---

## Future Roadmap

- [ ] **Golden image via Packer**: Bake Docker+Compose into a snapshot image instead of boot-time installs. Eliminates nondeterministic failures from upstream repo/CDN issues. Cloud-init becomes config-only.
- [ ] **Flaky LiteLLM Fix**: first deployment of the app on new infra tends to fail, for unhealthy litellm. re-deploy fixes. TODO: root cause and fix flakiness
