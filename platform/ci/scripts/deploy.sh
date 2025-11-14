#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

# Error trap
trap 'code=$?; echo "[ERROR] deploy failed"; exit $code' ERR

# Colors for output  
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m' 
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate required environment variables
if [[ -z "${TF_VAR_app_image:-}" ]]; then
    log_error "TF_VAR_app_image is required (dynamic variable from CI)"
    log_error "Example: export TF_VAR_app_image=ghcr.io/cogni-dao/cogni-template:app-abc123"
    exit 1
fi

# Environment selection - MUST be explicitly set for security
if [[ -z "${DEPLOY_ENVIRONMENT:-}" ]]; then
    log_error "DEPLOY_ENVIRONMENT must be explicitly set to 'preview' or 'prod'"
    log_error "This prevents accidental production deployments"
    log_error "Example: export DEPLOY_ENVIRONMENT=preview"
    exit 1
fi

ENVIRONMENT="$DEPLOY_ENVIRONMENT"
if [[ "$ENVIRONMENT" != "preview" && "$ENVIRONMENT" != "prod" ]]; then
    log_error "DEPLOY_ENVIRONMENT must be 'preview' or 'prod'"
    log_error "Current value: $ENVIRONMENT"
    exit 1
fi

# Check if environment-specific tfvars exists
DEPLOY_DIR="platform/infra/providers/cherry/app"
ENV_TFVARS="$DEPLOY_DIR/env.${ENVIRONMENT}.tfvars"
if [[ ! -f "$ENV_TFVARS" ]]; then
    log_error "Environment tfvars not found: $ENV_TFVARS"
    log_error "Available environments: preview, prod"
    exit 1
fi

log_info "Deploying to environment: $ENVIRONMENT"
log_info "Using tfvars file: $ENV_TFVARS"

# Validate required secrets are provided as environment variables
REQUIRED_SECRETS=(
    "TF_VAR_database_url"
    "TF_VAR_ssh_private_key" 
    "TF_VAR_litellm_master_key"
    "TF_VAR_openrouter_api_key"
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    if [[ -z "${!secret:-}" ]]; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [[ ${#MISSING_SECRETS[@]} -gt 0 ]]; then
    log_error "Missing required secret environment variables:"
    for secret in "${MISSING_SECRETS[@]}"; do
        log_error "  - $secret"
    done
    log_error ""
    log_error "These should come from GitHub Environment Secrets in CI,"
    log_error "or be set manually for local deployment testing."
    exit 1
fi

log_info "✅ All required secrets provided via environment variables"

# Set artifact directory (DEPLOY_DIR already set above)
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}/deploy-${GITHUB_RUN_ID:-$$}"
mkdir -p "$ARTIFACT_DIR"

log_info "Deploying to Cherry Servers..."
log_info "App image: $TF_VAR_app_image"
log_info "Environment: $ENVIRONMENT (domain/host from tfvars)"
log_info "Artifact directory: $ARTIFACT_DIR"

# Print Terraform version
tofu version

# Initialize Terraform
log_info "Initializing Terraform..."
tofu -chdir="$DEPLOY_DIR" init -upgrade -input=false -lock-timeout=5m

# Plan deployment - don't capture logs to prevent secret leaks
log_info "Planning deployment..."
tofu -chdir="$DEPLOY_DIR" plan \
  -var-file="env.${ENVIRONMENT}.tfvars" \
  -input=false -no-color -lock-timeout=5m \
  -out="$ARTIFACT_DIR/tfplan"

# Apply deployment - don't capture logs to prevent secret leaks
log_info "Applying deployment..."
tofu -chdir="$DEPLOY_DIR" apply \
  -auto-approve -no-color -lock-timeout=5m \
  "$ARTIFACT_DIR/tfplan"

# Store deployment metadata
log_info "Recording deployment metadata..."
cat > "$ARTIFACT_DIR/deployment.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "app_image": "$TF_VAR_app_image",
  "commit": "${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}",
  "ref": "${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}",
  "actor": "${GITHUB_ACTOR:-$(whoami)}"
}
EOF

log_info "✅ Deployment complete!"
log_info ""
log_info "Deployment artifacts in $ARTIFACT_DIR:"
log_info "  - plan.log: Terraform plan output"  
log_info "  - apply.log: Terraform apply output"
log_info "  - deployment.json: Deployment metadata"
log_info "  - tfplan: Terraform plan file"
log_info ""
log_info "CI should upload $ARTIFACT_DIR/* as artifacts"