#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Script: platform/ci/scripts/deploy.sh
# Purpose: Deploy containerized stack to remote VM via SSH with disk-aware cleanup to prevent 'no space left' failures.
# Invariants:
#   - APP_IMAGE and DEPLOY_ENVIRONMENT must be set; secrets via env vars
#   - Keeps exactly 1 previous app image via stable 'keep-last' tag
#   - Prunes BEFORE pull when disk >= 70%
# Notes:
#   - 70% threshold prevents overlayfs extraction failures on 20GB disks
#   - Hard prune may force service image re-pull (reliability > speed)
#   - Uses --volumes safely (all state in bind mounts, not named volumes)
# Links: Called by .github/workflows/deploy.yml; uses platform/infra/services/runtime/

set -euo pipefail

# Resolve repo root robustly
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

on_fail() {
  code=$?
  echo "[ERROR] deploy failed (exit $code), collecting debug info from VM..."

  emit_deployment_event "deployment.failed" "failed" "Deployment failed with exit code $code"

  if [[ -n "${VM_HOST:-}" ]]; then
    ssh $SSH_OPTS root@"$VM_HOST" <<'EOF' || true
      echo "=== edge compose ps ==="
      docker compose --project-name cogni-edge -f /opt/cogni-template-edge/docker-compose.yml ps || true

      echo "=== runtime compose ps ==="
      docker compose --project-name cogni-runtime -f /opt/cogni-template-runtime/docker-compose.yml ps || true

      echo "=== logs: caddy (edge) ==="
      docker compose --project-name cogni-edge -f /opt/cogni-template-edge/docker-compose.yml logs --tail 80 caddy || true

      echo "=== logs: app ==="
      docker compose --project-name cogni-runtime -f /opt/cogni-template-runtime/docker-compose.yml logs --tail 80 app || true

      echo "=== logs: litellm ==="
      docker compose --project-name cogni-runtime -f /opt/cogni-template-runtime/docker-compose.yml logs --tail 80 litellm || true
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

# Emit deployment event to Grafana Cloud Loki
emit_deployment_event() {
  local event="$1"
  local status="$2"
  local message="$3"

  # Skip if Grafana Cloud not configured
  if [[ -z "${GRAFANA_CLOUD_LOKI_URL:-}" ]] || [[ -z "${GRAFANA_CLOUD_LOKI_USER:-}" ]] || [[ -z "${GRAFANA_CLOUD_LOKI_API_KEY:-}" ]]; then
    return 0
  fi

  # Build structured event with low-cardinality labels
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  local nanoseconds=$(date +%s)000000000

  local event_payload=$(jq -n \
    --arg ns "$nanoseconds" \
    --arg event "$event" \
    --arg status "$status" \
    --arg msg "$message" \
    --arg env "${DEPLOY_ENVIRONMENT:-unknown}" \
    --arg commit "${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}" \
    --arg actor "${GITHUB_ACTOR:-$(whoami)}" \
    --arg image "${APP_IMAGE:-unknown}" \
    --arg timestamp "$timestamp" \
    '{
      streams: [{
        stream: {
          app: "cogni-template",
          env: $env,
          service: "deployment",
          stream: "stdout"
        },
        values: [[$ns, ({
          level: "info",
          event: $event,
          status: $status,
          msg: $msg,
          commit: $commit,
          actor: $actor,
          appImage: $image,
          time: $timestamp
        } | tostring)]]
      }]
    }')

  # POST to Grafana Cloud Loki (suppress errors to not break deployment)
  curl -s -X POST "$GRAFANA_CLOUD_LOKI_URL" \
    -u "${GRAFANA_CLOUD_LOKI_USER}:${GRAFANA_CLOUD_LOKI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$event_payload" &>/dev/null || true
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
    log_error "Example: export APP_IMAGE=ghcr.io/cogni-dao/cogni-template:preview-abc123"
    exit 1
fi

if [[ -z "${MIGRATOR_IMAGE:-}" ]]; then
    log_error "MIGRATOR_IMAGE is required (dynamic variable from CI)"
    log_error "Example: export MIGRATOR_IMAGE=ghcr.io/cogni-dao/cogni-template:preview-abc123-migrate"
    log_error "Tag must match APP_IMAGE with '-migrate' suffix (INV-COUPLED-TAGS-NO-GUESSING)"
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

# Check optional secrets (warn if missing, don't fail)
OPTIONAL_SECRETS=(
    "GRAFANA_CLOUD_LOKI_URL"
    "GRAFANA_CLOUD_LOKI_USER"
    "GRAFANA_CLOUD_LOKI_API_KEY"
)

for secret in "${OPTIONAL_SECRETS[@]}"; do
    if [[ -z "${!secret:-}" ]]; then
        log_warn "Optional secret not set: $secret"
        log_warn "  → Log forwarding to Grafana Cloud will be disabled"
    fi
done

# Set artifact directory
ARTIFACT_DIR="${RUNNER_TEMP:-/tmp}/deploy-${GITHUB_RUN_ID:-$$}"
mkdir -p "$ARTIFACT_DIR"

log_info "Deploying to Cherry Servers via Docker Compose..."
log_info "App image: $APP_IMAGE"
log_info "Migrator image: $MIGRATOR_IMAGE"
log_info "Environment: $ENVIRONMENT"
log_info "Domain: $DOMAIN"
log_info "VM Host: $VM_HOST"
log_info "Artifact directory: $ARTIFACT_DIR"

# Emit deployment start event
emit_deployment_event "deployment.started" "in_progress" "Deploying $APP_IMAGE to $ENVIRONMENT"

# Deploy runtime stack via SSH + Docker Compose
log_info "Connecting to VM and deploying containers..."

# Create deployment script for remote execution
cat > "$ARTIFACT_DIR/deploy-remote.sh" << 'EOF'
#!/bin/bash
# Remote deployment script (generated by deploy.sh)
# Purpose: Execute Docker Compose operations on VM with zero-downtime edge handling.
# Architecture:
#   - Edge stack (Caddy): Always-on TLS termination, never stopped during app deploys
#   - Runtime stack (app, postgres, litellm, alloy): Mutable, updated on each deploy
# Invariants:
#   - cogni-edge network must exist before any compose up
#   - Edge is started once and rarely touched (only on Caddyfile changes)
#   - App deploys use pull-while-running, no `compose down` unless emergency prune

set -euo pipefail

# Compose shortcuts (explicit project names, no global export)
EDGE_COMPOSE="docker compose --project-name cogni-edge -f /opt/cogni-template-edge/docker-compose.yml"
RUNTIME_COMPOSE="docker compose --project-name cogni-runtime -f /opt/cogni-template-runtime/docker-compose.yml"

log_info() {
    echo -e "\033[0;32m[INFO]\033[0m $1"
}

log_warn() {
    echo -e "\033[1;33m[WARN]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
}

# Emit deployment event to Grafana Cloud Loki (remote script)
emit_deployment_event() {
  local event="$1"
  local status="$2"
  local message="$3"

  # Skip if Grafana Cloud not configured
  if [[ -z "${GRAFANA_CLOUD_LOKI_URL:-}" ]] || [[ -z "${GRAFANA_CLOUD_LOKI_USER:-}" ]] || [[ -z "${GRAFANA_CLOUD_LOKI_API_KEY:-}" ]]; then
    return 0
  fi

  # Build structured event with low-cardinality labels
  local timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)
  local nanoseconds=$(date +%s)000000000

  local event_payload=$(jq -n \
    --arg ns "$nanoseconds" \
    --arg event "$event" \
    --arg status "$status" \
    --arg msg "$message" \
    --arg env "${DEPLOY_ENVIRONMENT:-unknown}" \
    --arg commit "${COMMIT_SHA:-unknown}" \
    --arg actor "${DEPLOY_ACTOR:-unknown}" \
    --arg image "${APP_IMAGE:-unknown}" \
    --arg timestamp "$timestamp" \
    '{
      streams: [{
        stream: {
          app: "cogni-template",
          env: $env,
          service: "deployment",
          stream: "stdout"
        },
        values: [[$ns, ({
          level: "info",
          event: $event,
          status: $status,
          msg: $msg,
          commit: $commit,
          actor: $actor,
          appImage: $image,
          time: $timestamp
        } | tostring)]]
      }]
    }')

  # POST to Grafana Cloud Loki (suppress errors to not break deployment)
  curl -s -X POST "$GRAFANA_CLOUD_LOKI_URL" \
    -u "${GRAFANA_CLOUD_LOKI_USER}:${GRAFANA_CLOUD_LOKI_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$event_payload" &>/dev/null || true
}

# Portable hash function (sha256sum on Linux, shasum on macOS)
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    log_warn "No sha256 tool available, skipping config hash check"
    echo "no-hash-tool"
  fi
}

log_info "Setting up deployment environment on VM..."

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 0: Create shared network (idempotent, must exist before any compose up)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Ensuring cogni-edge network exists..."
docker network create cogni-edge 2>/dev/null || true

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Write environment files
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Creating environment files..."

# Edge env (minimal - just domain for Caddyfile)
cat > /opt/cogni-template-edge/.env << ENV_EOF
DOMAIN=${DOMAIN}
ENV_EOF

# Runtime env (full app config)
cat > /opt/cogni-template-runtime/.env << ENV_EOF
DOMAIN=${DOMAIN}
APP_ENV=${APP_ENV}
APP_IMAGE=${APP_IMAGE}
MIGRATOR_IMAGE=${MIGRATOR_IMAGE}
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
DEPLOY_ENVIRONMENT=${DEPLOY_ENVIRONMENT}
DEFAULT_MODEL=${DEFAULT_MODEL:-}
LOKI_WRITE_URL=${GRAFANA_CLOUD_LOKI_URL:-}
LOKI_USERNAME=${GRAFANA_CLOUD_LOKI_USER:-}
LOKI_PASSWORD=${GRAFANA_CLOUD_LOKI_API_KEY:-}
ENV_EOF

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Start edge stack (idempotent - only starts if not running)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Ensuring edge stack (Caddy) is running..."
EDGE_RUNNING=$($EDGE_COMPOSE ps -q caddy 2>/dev/null | wc -l || echo "0")
if [[ "$EDGE_RUNNING" -eq 0 ]]; then
  log_info "Starting edge stack..."
  $EDGE_COMPOSE up -d
else
  log_info "Edge stack already running"
  # Check for Caddyfile changes and restart if needed
  HASH_DIR="/var/lib/cogni"
  CADDYFILE="/opt/cogni-template-edge/configs/Caddyfile.tmpl"
  CADDY_HASH_FILE="$HASH_DIR/caddyfile.sha256"

  if [[ -f "$CADDYFILE" ]]; then
    mkdir -p "$HASH_DIR"
    NEW_HASH=$(hash_file "$CADDYFILE")
    OLD_HASH=$(cat "$CADDY_HASH_FILE" 2>/dev/null || echo "none")

    if [[ "$NEW_HASH" != "$OLD_HASH" && "$NEW_HASH" != "no-hash-tool" ]]; then
      log_info "Caddyfile changed (hash: ${NEW_HASH:0:12}...), reloading Caddy..."
      $EDGE_COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile || $EDGE_COMPOSE restart caddy
      echo "$NEW_HASH" > "$CADDY_HASH_FILE"
      log_info "Caddy reloaded with new config"
    fi
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Authenticate to GHCR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Logging into GHCR for private image pulls..."
echo "${GHCR_DEPLOY_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Validate images exist (fail fast)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Validating required images are available..."
cd /opt/cogni-template-runtime
if ! $RUNTIME_COMPOSE --dry-run --profile bootstrap pull; then
  log_error "❌ Required images not found in registry"
  log_error "Build workflow may have failed - check previous workflow run"
  log_error "Expected: APP_IMAGE=${APP_IMAGE}, MIGRATOR_IMAGE=${MIGRATOR_IMAGE}"
  exit 1
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 5: Tag running image for rollback (keep exactly 1 previous version)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Tagging currently running app image for preservation..."
RUNNING_IMAGE="$($RUNTIME_COMPOSE ps -q app 2>/dev/null | xargs -r docker inspect --format '{{.Config.Image}}' 2>/dev/null || true)"
if [[ -n "${RUNNING_IMAGE:-}" ]]; then
  docker image tag "$RUNNING_IMAGE" cogni-runtime:keep-last || true
  log_info "Tagged running image: $RUNNING_IMAGE"
else
  log_info "No running app image found (likely first deploy)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 6: Conditional disk cleanup (emergency only, excludes edge)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [[ "$DISK_USAGE" -ge 70 ]]; then
  log_warn "Disk usage at ${DISK_USAGE}% (>= 70%) - pruning unused images..."
  log_info "Disk before prune:"
  df -h / || true
  # Prune dangling images but NOT unused tagged images (keep-last must survive)
  # Do NOT stop edge - only prune dangling images, not unused tagged ones
  docker image prune -f || true
  docker builder prune -af || true
  log_info "Disk after prune:"
  df -h / || true
  log_info "Prune complete (edge untouched)"
else
  log_info "Disk usage at ${DISK_USAGE}% - no prune needed"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 7: Pull images while old app is still serving traffic
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "[$(date -u +%H:%M:%S)] Pulling updated images (app continues serving)..."
emit_deployment_event "deployment.pull_started" "in_progress" "Pulling images from registry"
$RUNTIME_COMPOSE --profile bootstrap pull
log_info "[$(date -u +%H:%M:%S)] Pull complete"
emit_deployment_event "deployment.pull_complete" "success" "Images pulled successfully"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 8: Start/update postgres (must be healthy before migrations)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Bringing up postgres..."
$RUNTIME_COMPOSE up -d postgres

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 9: Run DB provisioning and migrations
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "[$(date -u +%H:%M:%S)] Running DB provisioning..."
emit_deployment_event "deployment.db_provision_started" "in_progress" "Provisioning database users and schemas"
$RUNTIME_COMPOSE --profile bootstrap run --rm db-provision
log_info "[$(date -u +%H:%M:%S)] DB provisioning complete"
emit_deployment_event "deployment.db_provision_complete" "success" "Database provisioned successfully"

log_info "[$(date -u +%H:%M:%S)] Running database migrations..."
emit_deployment_event "deployment.migration_started" "in_progress" "Running database migrations"
$RUNTIME_COMPOSE --profile bootstrap run --rm db-migrate
log_info "[$(date -u +%H:%M:%S)] Migrations complete"
emit_deployment_event "deployment.migration_complete" "success" "Migrations applied successfully"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 10: Start/update runtime stack (rolling update, no down)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "[$(date -u +%H:%M:%S)] Starting runtime stack (rolling update)..."
emit_deployment_event "deployment.stack_up_started" "in_progress" "Starting container stack"
$RUNTIME_COMPOSE up -d --remove-orphans
log_info "[$(date -u +%H:%M:%S)] Stack up complete"
emit_deployment_event "deployment.stack_up_complete" "success" "All containers started"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 11: Checksum-gated restart for LiteLLM config changes
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HASH_DIR="/var/lib/cogni"
LITELLM_CONFIG="/opt/cogni-template-runtime/configs/litellm.config.yaml"
LITELLM_HASH_FILE="$HASH_DIR/litellm-config.sha256"

if [[ ! -f "$LITELLM_CONFIG" ]]; then
  log_warn "LiteLLM config missing at $LITELLM_CONFIG, skipping restart check"
else
  mkdir -p "$HASH_DIR"
  NEW_HASH=$(hash_file "$LITELLM_CONFIG")
  OLD_HASH=$(cat "$LITELLM_HASH_FILE" 2>/dev/null || echo "none")

  if [[ "$NEW_HASH" != "$OLD_HASH" && "$NEW_HASH" != "no-hash-tool" ]]; then
    log_info "LiteLLM config changed (hash: ${NEW_HASH:0:12}...), restarting container..."
    emit_deployment_event "deployment.litellm_restart" "in_progress" "Restarting LiteLLM due to config change"
    $RUNTIME_COMPOSE restart litellm
    echo "$NEW_HASH" > "$LITELLM_HASH_FILE"
    log_info "LiteLLM restarted with new config"
    emit_deployment_event "deployment.litellm_restart_complete" "success" "LiteLLM restarted successfully"
  else
    log_info "LiteLLM config unchanged (hash: ${NEW_HASH:0:12}...), no restart needed"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 12: Verify deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_info "Waiting for containers to be ready..."
sleep 10

log_info "Checking container status..."
echo "=== Edge stack ==="
$EDGE_COMPOSE ps
echo "=== Runtime stack ==="
$RUNTIME_COMPOSE ps

emit_deployment_event "deployment.complete" "success" "Deployment completed successfully"
log_info "✅ Deployment complete!"
EOF

# Make deployment script executable
chmod +x "$ARTIFACT_DIR/deploy-remote.sh"

# Deploy bundles to VM via rsync
log_info "Deploying edge and runtime bundles to VM..."
ssh $SSH_OPTS root@"$VM_HOST" "mkdir -p /opt/cogni-template-edge /opt/cogni-template-runtime"

# Upload edge bundle (rarely changes - Caddy config only)
rsync -av -e "ssh $SSH_OPTS" \
  "$REPO_ROOT/platform/infra/services/edge/" \
  root@"$VM_HOST":/opt/cogni-template-edge/

# Upload runtime bundle (app stack config)
rsync -av -e "ssh $SSH_OPTS" \
  "$REPO_ROOT/platform/infra/services/runtime/" \
  root@"$VM_HOST":/opt/cogni-template-runtime/

# Upload and execute deployment script
scp $SSH_OPTS "$ARTIFACT_DIR/deploy-remote.sh" root@"$VM_HOST":/tmp/deploy-remote.sh
ssh $SSH_OPTS root@"$VM_HOST" \
    "DOMAIN='$DOMAIN' APP_ENV='$APP_ENV' DEPLOY_ENVIRONMENT='$DEPLOY_ENVIRONMENT' APP_IMAGE='$APP_IMAGE' MIGRATOR_IMAGE='$MIGRATOR_IMAGE' DATABASE_URL='$DATABASE_URL' LITELLM_MASTER_KEY='$LITELLM_MASTER_KEY' OPENROUTER_API_KEY='$OPENROUTER_API_KEY' AUTH_SECRET='$AUTH_SECRET' POSTGRES_ROOT_USER='$POSTGRES_ROOT_USER' POSTGRES_ROOT_PASSWORD='$POSTGRES_ROOT_PASSWORD' APP_DB_USER='$APP_DB_USER' APP_DB_PASSWORD='$APP_DB_PASSWORD' APP_DB_NAME='$APP_DB_NAME' GHCR_DEPLOY_TOKEN='$GHCR_DEPLOY_TOKEN' GHCR_USERNAME='$GHCR_USERNAME' GRAFANA_CLOUD_LOKI_URL='${GRAFANA_CLOUD_LOKI_URL:-}' GRAFANA_CLOUD_LOKI_USER='${GRAFANA_CLOUD_LOKI_USER:-}' GRAFANA_CLOUD_LOKI_API_KEY='${GRAFANA_CLOUD_LOKI_API_KEY:-}' COMMIT_SHA='${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}' DEPLOY_ACTOR='${GITHUB_ACTOR:-$(whoami)}' bash /tmp/deploy-remote.sh"

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
log_info "  - Health Check: https://$DOMAIN/health"
log_info ""
log_info "📁 Deployment artifacts in $ARTIFACT_DIR:"
log_info "  - deployment.json: Deployment metadata"
log_info "  - deploy-remote.sh: Remote deployment script"
log_info ""
log_info "🔧 Deployment management:"
log_info "  - SSH access: ssh root@$VM_HOST"
log_info "  - Edge logs: docker compose --project-name cogni-edge -f /opt/cogni-template-edge/docker-compose.yml logs"
log_info "  - Runtime logs: docker compose --project-name cogni-runtime -f /opt/cogni-template-runtime/docker-compose.yml logs"
