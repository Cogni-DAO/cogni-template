# Deployment Fix Priority List

## Priority 0 (P0) - Immediate Blockers

### Security & State Management

- [ ] **Lock down Terraform state + secrets**: Set up separate, encrypted backends for preview/prod, mark all sensitive vars as `sensitive = true`, remove raw SSH keys from TF state
- [ ] **Harden preview deploys from PRs**: Ensure preview deploys only run for trusted branches/users, prevent secrets exposure to untrusted forks

### Critical Deployment Blockers

- [x] **Fix tag mismatch crisis**: Align image tags between build and deploy workflows
  - ✅ All workflows now use consistent `app-${{ github.sha }}` tagging
  - ✅ Single image per commit strategy implemented
- [x] **Create missing LiteLLM config file**: Create `platform/infra/services/litellm/litellm.config.yaml`
- [x] **Fix deploy.sh to use terraform.tfvars**: ✅ Implemented proper secrets/config separation
  - ✅ Created `env.preview.tfvars` and `env.prod.tfvars` with non-secret config
  - ✅ Updated `variables.tf` with clear sections for topology/secrets
  - ✅ Modified `deploy.sh` to use environment-specific tfvars + validate secrets
  - ✅ Removed old `terraform.tfvars` with mixed secrets
- [ ] **Add SSH private key handling**: Add `ssh_private_key` to terraform.tfvars or create secure injection mechanism

## Priority 1 (P1) - Core Functionality

### Runtime Configuration

- [ ] **Add missing runtime environment variables to Terraform deployment**:
  - `APP_BASE_URL`, `DATABASE_URL`, `OPENROUTER_API_KEY` needed in main.tf docker run command
- [ ] **Implement single image per commit strategy**: Build `app:${sha}` once, reuse for preview/prod with runtime-only secrets
- [ ] **Separate preview vs prod state clearly**: Enforce distinct workspaces/backends so preview cannot mutate prod resources
- [ ] **Add production environment protection**: Manual approval/required reviewers for prod deployments

### Workflow Fixes

- [ ] **Fix branch trigger mismatch**: Change deploy-preview.yml from `branches: [a]` to `branches: [main]`

## Priority 2 (P2) - Workflow Orchestration

- [ ] **Fix build-deploy race condition**: Ensure deploy only runs after successful build+push using workflow_run or single workflow

## Priority 3 (P3) - Technical Debt & Maintainability

- [ ] **Generalize LLM network config**: Make `litellm_host` and `litellm_port` configurable TF variables instead of hardcoded
- [ ] **Reduce secrets duplication/naming drift**: Create consistent mapping between logical secrets and TF*VAR*\* names

## Duplicates Identified

**✅ DevOps Engineer Priority Assessment**: I agree with the P0 ranking - security and state management should come first, followed by deployment blockers. The "One image per commit" recommendation overlaps with our "tag mismatch" issue and provides a better long-term solution.

**Duplicates Found**:

- "One image per commit" (P1) addresses our "Tag Mismatch Crisis" (immediate)
- "Runtime environment variables" appears in both analyses
- "SSH private key handling" mentioned by both

The principal engineer's prioritization is sound - focusing on security first, then core functionality, then orchestration improvements.
