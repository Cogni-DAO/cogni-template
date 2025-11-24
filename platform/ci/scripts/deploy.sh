#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

# Resolve repo root robustly
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

on_fail() {
  code=$?
  echo "[ERROR] deploy failed (exit $code), collecting debug info from VM..."

  if [[ -n "${VM_HOST:-}" ]]; then
    ssh $SSH_OPTS root@"$VM_HOST" <<'EOF' || true
      echo "=== docker compose ps ==="
      cd /opt/cogni-template-runtime && docker compose ps || echo "docker compose ps failed"

      echo "=== logs: app ==="
      cd /opt/cogni-template-runtime && docker compose logs --tail 80 app || true

      echo "=== logs: litellm ==="
      cd /opt/cogni-template-runtime && docker compose logs --tail 80 litellm || true

      echo "=== logs: caddy ==="
      cd /opt/cogni-template-runtime && docker compose logs --tail 80 caddy || true
EOF
  fi

  exit "$code"
}

trap on_fail ERR

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

# SSH configuration  
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/deploy_key}"

if [[ -f "$SSH_KEY_PATH" ]]; then
    # Found deploy key (CI or explicit local override)
    log_info "SSH key validated: $SSH_KEY_PATH"
    SSH_OPTS="-i $SSH_KEY_PATH -o StrictHostKeyChecking=yes"
    
    # Validate permissions
    if [[ "$(stat -c %a "$SSH_KEY_PATH" 2>/dev/null || stat -f %A "$SSH_KEY_PATH" 2>/dev/null)" != "600" ]]; then
        log_error "SSH key has incorrect permissions. Expected 600, got: $(stat -c %a "$SSH_KEY_PATH" 2>/dev/null || stat -f %A "$SSH_KEY_PATH" 2>/dev/null)"
        exit 1
    fi
else
    # No deploy key found - use default SSH (local development)
    log_info "No deploy key found, using default SSH configuration"
    SSH_OPTS="-o StrictHostKeyChecking=yes"
fi

# Validate required environment variables
if [[ -z "${APP_IMAGE:-}" ]]; then
    log_error "APP_IMAGE is required (dynamic variable from CI)"
    log_error "Example: export APP_IMAGE=ghcr.io/cogni-dao/cogni-template:app-abc123"
    exit 1
fi

# Environment selection - MUST be explicitly set for security
if [[ -z "${DEPLOY_ENVIRONMENT:-}" ]]; then
    log_error "DEPLOY_ENVIRONMENT must be explicitly set to 'preview' or 'production'"
    log_error "This prevents accidental production deployments"
    log_error "Example: export DEPLOY_ENVIRONMENT=preview"
    exit 1
fi

ENVIRONMENT="$DEPLOY_ENVIRONMENT"
if [[ "$ENVIRONMENT" != "preview" && "$ENVIRONMENT" != "production" ]]; then
    log_error "DEPLOY_ENVIRONMENT must be 'preview' or 'production'"
    log_error "Current value: $ENVIRONMENT"
    exit 1
fi

# Validate required secrets are provided as environment variables
REQUIRED_SECRETS=(
    "DOMAIN"
    "DATABASE_URL"
    "LITELLM_MASTER_KEY"
    "OPENROUTER_API_KEY"
    "AUTH_SECRET"
    "VM_HOST"
    "POSTGRES_ROOT_USER"
    "POSTGRES_ROOT_PASSWORD"
    "APP_DB_USER"
    "APP_DB_PASSWORD"
    "APP_DB_NAME"
)

# Check required environment variables (not secrets)
REQUIRED_ENV_VARS=(
    "APP_ENV"
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    if [[ -z "${!secret:-}" ]]; then
        MISSING_SECRETS+=("$secret")
    fi
done

MISSING_ENV_VARS=()
for env_var in "${REQUIRED_ENV_VARS[@]}"; do
    if [[ -z "${!env_var:-}" ]]; then
        MISSING_ENV_VARS+=("$env_var")
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

if [[ ${#MISSING_ENV_VARS[@]} -gt 0 ]]; then
    log_error "Missing required environment variables:"
    for env_var in "${MISSING_ENV_VARS[@]}"; do
        log_error "  - $env_var"
    done
    log_error ""
    log_error "These should be set in the GitHub workflow environment."
    exit 1
fi

log_info "✅ All required secrets provided via environment variables"

# Set artifact directory
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}/deploy-${GITHUB_RUN_ID:-$$}"
mkdir -p "$ARTIFACT_DIR"

log_info "Deploying to Cherry Servers via Docker Compose..."
log_info "App image: $APP_IMAGE"
log_info "Environment: $ENVIRONMENT"
log_info "Domain: $DOMAIN"
log_info "VM Host: $VM_HOST"
log_info "Artifact directory: $ARTIFACT_DIR"

# Deploy runtime stack via SSH + Docker Compose
log_info "Connecting to VM and deploying containers..."

# Create deployment script for remote execution
cat > "$ARTIFACT_DIR/deploy-remote.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

log_info() {
    echo -e "\033[0;32m[INFO]\033[0m $1"
}

log_info "Setting up runtime environment on VM..."

# Set compose project name for consistent container naming
export COMPOSE_PROJECT_NAME=cogni-template-runtime

# Create required directories for data persistence
sudo mkdir -p /var/lib/promtail

# Change to runtime bundle directory
cd /opt/cogni-template-runtime

# Write environment file
log_info "Creating runtime environment file..."
cat > .env << ENV_EOF
DOMAIN=${DOMAIN}
APP_ENV=${APP_ENV}
APP_IMAGE=${APP_IMAGE}
APP_BASE_URL=https://${DOMAIN}
NEXTAUTH_URL=https://${DOMAIN}
DATABASE_URL=${DATABASE_URL}
LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
AUTH_SECRET=${AUTH_SECRET}
POSTGRES_ROOT_USER=${POSTGRES_ROOT_USER}
POSTGRES_ROOT_PASSWORD=${POSTGRES_ROOT_PASSWORD}
APP_DB_USER=${APP_DB_USER}
APP_DB_PASSWORD=${APP_DB_PASSWORD}
APP_DB_NAME=${APP_DB_NAME}
ENV_EOF

log_info "Logging into GHCR for private image pulls..."
echo "${GHCR_DEPLOY_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

log_info "Validating required images are available..."
if ! docker compose pull --dry-run; then
  log_error "❌ Required images not found in registry"
  log_error "Build workflow may have failed - check previous workflow run"
  exit 1
fi

log_info "Running Docker cleanup to free space..."
docker system prune -af --volumes || echo "Docker cleanup failed, continuing..."

log_info "Pulling latest images..."
docker compose pull

log_info "Running database migrations with new image..."
docker compose run --rm --entrypoint sh app -lc 'pnpm db:migrate:container'

log_info "Starting runtime stack (rolling update)..."
docker compose up -d --remove-orphans

log_info "Waiting for containers to be ready..."
sleep 10

log_info "Checking container status..."
docker compose ps

log_info "✅ Deployment complete!"
EOF

# Make deployment script executable
chmod +x "$ARTIFACT_DIR/deploy-remote.sh"

# Deploy runtime bundle to VM via rsync
log_info "Deploying runtime bundle to VM..."
ssh $SSH_OPTS root@"$VM_HOST" "mkdir -p /opt/cogni-template-runtime"

# Upload entire runtime bundle atomically
rsync -av -e "ssh $SSH_OPTS" \
  "$REPO_ROOT/platform/infra/services/runtime/" \
  root@"$VM_HOST":/opt/cogni-template-runtime/

# Upload and execute deployment script
scp $SSH_OPTS "$ARTIFACT_DIR/deploy-remote.sh" root@"$VM_HOST":/tmp/deploy-remote.sh
ssh $SSH_OPTS root@"$VM_HOST" \
    "DOMAIN='$DOMAIN' APP_ENV='$APP_ENV' APP_IMAGE='$APP_IMAGE' DATABASE_URL='$DATABASE_URL' LITELLM_MASTER_KEY='$LITELLM_MASTER_KEY' OPENROUTER_API_KEY='$OPENROUTER_API_KEY' AUTH_SECRET='$AUTH_SECRET' POSTGRES_ROOT_USER='$POSTGRES_ROOT_USER' POSTGRES_ROOT_PASSWORD='$POSTGRES_ROOT_PASSWORD' APP_DB_USER='$APP_DB_USER' APP_DB_PASSWORD='$APP_DB_PASSWORD' APP_DB_NAME='$APP_DB_NAME' GHCR_DEPLOY_TOKEN='$GHCR_DEPLOY_TOKEN' GHCR_USERNAME='$GHCR_USERNAME' bash /tmp/deploy-remote.sh"

# Health validation
log_info "Validating deployment health..."

max_attempts=3
sleep_seconds=3

check_url() {
  local url="$1"
  local label="$2"

  for i in $(seq 1 "$max_attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      log_info "✅ $label health check passed: $url"
      return 0
    fi
    log_warn "Attempt ${i}/${max_attempts}: $label not ready yet, waiting ${sleep_seconds}s..."
    sleep "$sleep_seconds"
  done

  log_error "❌ $label did not become ready after $((max_attempts * sleep_seconds))s: $url"
  return 1
}

check_url "https://$DOMAIN/health" "App"

# Store deployment metadata
log_info "Recording deployment metadata..."
cat > "$ARTIFACT_DIR/deployment.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "app_image": "$APP_IMAGE",
  "domain": "$DOMAIN",
  "vm_host": "$VM_HOST",
  "commit": "${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}",
  "ref": "${GITHUB_REF_NAME:-$(git branch --show-current 2>/dev/null || echo 'unknown')}",
  "actor": "${GITHUB_ACTOR:-$(whoami)}"
}
EOF

log_info "✅ Docker Compose deployment complete!"
log_info ""
log_info "🌐 Application URLs:"
log_info "  - Main App: https://$DOMAIN"
log_info "  - AI API: https://ai.$DOMAIN" 
log_info "  - Health Check: https://$DOMAIN/health"
log_info ""
log_info "📁 Deployment artifacts in $ARTIFACT_DIR:"
log_info "  - deployment.json: Deployment metadata"
log_info "  - deploy-remote.sh: Remote deployment script"
log_info ""
log_info "🔧 Deployment management:"
log_info "  - SSH access: ssh root@$VM_HOST"
log_info "  - Container logs: cd /opt/cogni-template-runtime && docker compose logs"
log_info "  - Container status: cd /opt/cogni-template-runtime && docker compose ps"
