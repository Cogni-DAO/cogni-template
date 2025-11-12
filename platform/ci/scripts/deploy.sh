#!/usr/bin/env bash
# SPDX-License-Identifier: PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni DAO

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
    log_error "TF_VAR_app_image is required"
    exit 1
fi

if [[ -z "${TF_VAR_domain:-}" ]]; then
    log_error "TF_VAR_domain is required"
    exit 1
fi

if [[ -z "${TF_VAR_host:-}" ]]; then
    log_error "TF_VAR_host is required"
    exit 1
fi

if [[ -z "${TF_VAR_ssh_private_key:-}" ]]; then
    log_error "TF_VAR_ssh_private_key is required (sensitive value not logged)"
    exit 1
fi

# Set directories
DEPLOY_DIR="platform/infra/providers/cherry/app"
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}/deploy-${GITHUB_RUN_ID:-$$}"
mkdir -p "$ARTIFACT_DIR"

log_info "Deploying to Cherry Servers..."
log_info "App image: $TF_VAR_app_image"
log_info "Domain: $TF_VAR_domain"
log_info "Host: $TF_VAR_host"
log_info "Artifact directory: $ARTIFACT_DIR"

# Print Terraform version
tofu version

# Initialize Terraform
log_info "Initializing Terraform..."
tofu -chdir="$DEPLOY_DIR" init -upgrade -input=false -lock-timeout=5m

# Plan deployment and capture output
log_info "Planning deployment..."
tofu -chdir="$DEPLOY_DIR" plan -input=false -no-color -lock-timeout=5m -out="$ARTIFACT_DIR/tfplan" | tee "$ARTIFACT_DIR/plan.log"

# Apply deployment
log_info "Applying deployment..."
tofu -chdir="$DEPLOY_DIR" apply -auto-approve -no-color -lock-timeout=5m "$ARTIFACT_DIR/tfplan" > "$ARTIFACT_DIR/apply.log" 2>&1

# Store deployment metadata
log_info "Recording deployment metadata..."
cat > "$ARTIFACT_DIR/deployment.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "app_image": "$TF_VAR_app_image",
  "domain": "$TF_VAR_domain", 
  "host": "$TF_VAR_host",
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