# Cogni Template Setup System

## Goal

**Get developers from fresh clone to working setup in 3 commands or less.**

Two distinct user journeys:

1. **Contributors:** Local development only (no CI/CD needed)
2. **Fork Owners:** Full deployment pipeline with GitHub Actions + Cherry VMs

## User Personas

### Persona 1: Contributor

- **Goal:** Contribute to cogni-template
- **Needs:** Local development environment only
- **Setup:** `pnpm setup local` and done

### Persona 2: Fork Owner

- **Goal:** Deploy their own instance with full CI/CD
- **Needs:** Local development + complete deployment pipeline
- **Setup:** Sequential commands handling all dependencies

## The Simple Workflows

### For Contributors: `pnpm setup local`

**Single command gets you developing:**

```bash
git clone https://github.com/Cogni-DAO/cogni-template
cd cogni-template
pnpm setup local
pnpm dev  # You're ready!
```

**What it does:**

1. Copy `.env.local.example` → `.env.local`
2. Generate secure random values:
   - `LITELLM_MASTER_KEY` (sk-xxx format)
   - `DATABASE_URL` (postgresql://postgres:postgres@localhost:5432/cogni_template_dev)
3. Prompt for `OPENROUTER_API_KEY`
4. Prompt for `EVM_RPC_URL` (Sepolia RPC from alchemy.com or infura.io)
5. Prompt for `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional, from cloud.walletconnect.com)
6. Run `platform/bootstrap/install/install-pnpm.sh`
7. `pnpm install` and setup git hooks

**No SSH keys, no Docker, no Cherry VMs, no GitHub secrets.**

### For Fork Owners: Sequential Setup

**Three-step flow handles all dependencies:**

```bash
# Step 1: Local development setup
pnpm setup local

# Step 2: Infrastructure (SSH keys + VMs)
pnpm setup infra --env preview
pnpm setup infra --env production

# Step 3: GitHub integration (secrets + CI/CD)
pnpm setup github --env preview
pnpm setup github --env production
```

## Detailed Fork Owner Flow

### Step 1: Local Setup (`pnpm setup local`)

- Same as contributor flow above
- Gets local development working first

### Step 2: Infrastructure (`pnpm setup infra --env <preview|production>`)

**Handles SSH key + VM provisioning:**

1. **Generate SSH keypair:**
   - `ssh-keygen -t ed25519 -f ~/.ssh/<repo-name>_<env>_deploy`
   - Copy public key → `platform/infra/providers/cherry/base/keys/`
   - **Manual:** User commits public key to repo

2. **Update Terraform vars:**
   - Auto-detect repo name from git remote
   - Update `.tfvars`: `vm_name_prefix`, `public_key_path`
   - Cherry API: create/get `project_id` automatically

3. **Provision Cherry VM:**
   - Validate `CHERRY_AUTH_TOKEN`
   - `tofu init && tofu apply -var-file=env.<env>.tfvars`

4. **Save outputs:**
   - Extract `vm_host` → write to `.env.<env>` file

### Step 3: GitHub Integration (`pnpm setup github --env <preview|production>`)

**Uses SSH keys + VM outputs from Step 2:**

1. **Create GitHub environment** (`preview` or `production`)

2. **Set all required secrets:**
   - **Database secrets:** Two-user security model per environment
     - `POSTGRES_ROOT_USER` (postgres)
     - `POSTGRES_ROOT_PASSWORD` (generated hex password)
     - `APP_DB_USER` (cogni_app_preview/cogni_app_production)
     - `APP_DB_PASSWORD` (generated hex password)
     - `APP_DB_NAME` (cogni_template_preview/cogni_template_production)
     - `DATABASE_URL` (postgresql://APP_DB_USER:APP_DB_PASSWORD@postgres:5432/APP_DB_NAME)
   - **Service secrets:** Fresh generation per environment
     - `LITELLM_MASTER_KEY` (new random sk-xxx key)
     - `AUTH_SECRET` (generated random string)
     - `OPENROUTER_API_KEY` (prompt if not in local env)
     - `EVM_RPC_URL` (prompt if not in local env - Sepolia RPC from alchemy.com or infura.io)
   - **Deployment secrets:** From previous steps
     - `SSH_DEPLOY_KEY` (from `~/.ssh/cogni_template_<env>_deploy`)
     - `VM_HOST` (from `.env.<env>` file)
     - `DOMAIN` (prompt user for their domain)
   - **Repository secrets:** (shared across environments)
     - `GHCR_DEPLOY_TOKEN` (prompt user to create GitHub PAT)
     - `CHERRY_AUTH_TOKEN` (prompt user for Cherry Servers API token)
     - `SONAR_TOKEN` (prompt user to create SonarCloud token)
     - `ACTIONS_AUTOMATION_BOT_PAT` (bot automation PAT, needs Contents:Write, Pull requests:Write, Actions:Read, Metadata:Read)
     - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` (optional from cloud.walletconnect.com; if missing, only injected wallets like MetaMask work)
     - **Grafana Cloud (optional):** For log aggregation in preview/production
       - `GRAFANA_CLOUD_LOKI_URL` (Loki push endpoint, e.g., https://logs-prod-020.grafana.net/loki/api/v1/push)
       - `GRAFANA_CLOUD_LOKI_USER` (numeric user ID from Grafana Cloud)
       - `GRAFANA_CLOUD_LOKI_API_KEY` (API key with logs:write permission)
       - Get from: https://grafana.com/products/cloud/ → Connections → Data Sources → Loki
     - **Prometheus Metrics (optional):** For metrics shipping to Grafana Cloud Mimir
       - `METRICS_TOKEN` (≥32 chars, bearer auth for /api/metrics scraping)
       - `PROMETHEUS_REMOTE_WRITE_URL` (Mimir push endpoint)
       - `PROMETHEUS_USERNAME` (Grafana Cloud username)
       - `PROMETHEUS_PASSWORD` (Grafana Cloud API key)

For current manual process, see [DEPLOY.md](../../platform/runbooks/DEPLOY.md).

3. **Apply branch protection rules:**
   - `main`: 2 required reviews, required checks, enforce for admins
   - `staging`: 1 required review, required checks
   - **Note:** SonarCloud creates two separate checks: `sonar` (GitHub Action job) and `SonarCloud Code Analysis` (Quality Gate). Both should be added to required checks.

4. **Print GitHub Apps checklist:**
   - Install URLs for: `cogni-git-review`, `cogni-git-admin`, `sonarcloud`
   - **SonarCloud setup:**
     1. Create SonarCloud project for your repo and organization
     2. Update `sonar-project.properties` with your organization and project key
     3. Disable "Automatic Analysis" in Project Settings → Analysis Method
     4. Generate token at https://sonarcloud.io/account/security → Add as SONAR_TOKEN repo secret

## Key Dependencies Resolved

**SSH Keys:** Generated in Step 2 → Used in Step 3  
**VM_HOST:** Generated in Step 2 → Used in Step 3  
**Secrets:** Fresh generation for each environment (no sharing local ↔ GitHub)

## Implementation Notes

**TypeScript-first:**

- `scripts/setup/bootstrap.ts` with subcommands: `local`, `infra`, `github`
- Hard-coded secret lists and branch rules (no YAML specs for v0)
- Uses `gh` CLI for GitHub API, assumes user Auth
- Disable Vercel telemetry: pnpm exec next telemetry disable

**Error handling:**

- Fail fast with clear next steps
- Check prerequisites before starting (gh auth, tofu install, etc.)
- Idempotent operations (safe to re-run)

## Success Criteria

✅ **Contributor:** `pnpm setup local` → `pnpm dev` works in under 2 minutes  
✅ **Fork Owner:** 3 commands → full CI/CD pipeline with auto-deploy on PRs  
✅ **No manual secret copying** between environments  
✅ **Clear dependency handling** (SSH keys → infra → GitHub)  
✅ **Eliminates 60+ step DEPLOY.md** with automated flow

## Future Evolution

When patterns stabilize, extract to:

- **Declarative specs:** `.cogni/setup.yaml` configuration
- **Multi-repo tool:** `cogni-admin` CLI package
- **DAO integration:** Automated multisig + plugin deployment
- **GitLab support:** Host-abstracted adapters

**v0 Focus:** Script-based, this-repo-only, maximum simplicity.
