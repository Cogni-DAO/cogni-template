#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Script: platform/ci/scripts/push.sh
# Purpose: Push APP_IMAGE, MIGRATOR_IMAGE, and SCHEDULER_WORKER_IMAGE to GHCR.
# Invariants:
#   - All images must exist locally (run build.sh and build-service.sh first)
#   - Tag coupling: APP_IMAGE=IMAGE_NAME:IMAGE_TAG, MIGRATOR_IMAGE=IMAGE_NAME:IMAGE_TAG-migrate
#   - SCHEDULER_WORKER_IMAGE: if set, pushed and digest captured
#   - Outputs digest refs for reproducible deployments

set -euo pipefail

# Error trap
trap 'code=$?; echo "[ERROR] push failed"; exit $code' ERR

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
if [[ -z "${IMAGE_NAME:-}" ]]; then
    log_error "IMAGE_NAME is required (e.g., ghcr.io/cogni-dao/cogni-template)"
    exit 1
fi

if [[ -z "${IMAGE_TAG:-}" ]]; then
    log_error "IMAGE_TAG is required (e.g., production-abc123)"
    exit 1
fi

# Ensure IMAGE_NAME is lowercase for Docker registry compatibility
IMAGE_NAME=$(echo "${IMAGE_NAME}" | tr '[:upper:]' '[:lower:]')

# Derive image references from IMAGE_NAME + IMAGE_TAG (INV-COUPLED-TAGS-NO-GUESSING)
APP_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
MIGRATOR_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}-migrate"

log_info "Pushing Docker images to GHCR..."
log_info "App image: $APP_IMAGE"
log_info "Migrator image: $MIGRATOR_IMAGE"

# Verify both images exist locally
if ! docker inspect "$APP_IMAGE" > /dev/null 2>&1; then
    log_error "App image $APP_IMAGE not found locally. Run build.sh first."
    exit 1
fi

if ! docker inspect "$MIGRATOR_IMAGE" > /dev/null 2>&1; then
    log_error "Migrator image $MIGRATOR_IMAGE not found locally. Run build.sh first."
    exit 1
fi

# Push app image
log_info ""
log_info "=== Pushing app image ==="
docker push "$APP_IMAGE"

# Push migrator image
log_info ""
log_info "=== Pushing migrator image ==="
docker push "$MIGRATOR_IMAGE"

# Verify pushes were successful
log_info ""
log_info "=== Verifying pushes ==="

if docker pull --platform linux/amd64 "$APP_IMAGE" > /dev/null 2>&1; then
    docker rmi "$APP_IMAGE" > /dev/null 2>&1 || true
    log_info "✅ App image push verified: $APP_IMAGE"
else
    log_error "App image push verification failed"
    exit 1
fi

if docker pull --platform linux/amd64 "$MIGRATOR_IMAGE" > /dev/null 2>&1; then
    docker rmi "$MIGRATOR_IMAGE" > /dev/null 2>&1 || true
    log_info "✅ Migrator image push verified: $MIGRATOR_IMAGE"
else
    log_error "Migrator image push verification failed"
    exit 1
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Push scheduler-worker image (P0 Bridge MVP - optional, only if built)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEDULER_WORKER_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}-scheduler-worker"

if docker inspect "$SCHEDULER_WORKER_IMAGE" > /dev/null 2>&1; then
    log_info ""
    log_info "=== Pushing scheduler-worker image ==="
    docker push "$SCHEDULER_WORKER_IMAGE"

    # Capture digest ref after push (INV: deploy uses digest, not tag)
    log_info "Capturing scheduler-worker digest..."
    SCHEDULER_WORKER_DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' "$SCHEDULER_WORKER_IMAGE")

    if [[ -z "$SCHEDULER_WORKER_DIGEST" ]]; then
        log_error "Failed to capture scheduler-worker digest"
        exit 1
    fi

    log_info "✅ scheduler-worker pushed: $SCHEDULER_WORKER_DIGEST"

    # Export canonical digest ref for workflow output
    # This is the value that deploy.sh must receive
    export SCHEDULER_WORKER_IMAGE_DIGEST="$SCHEDULER_WORKER_DIGEST"

    # Write to GITHUB_OUTPUT if running in CI (for workflow outputs)
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        echo "scheduler_worker_image=${SCHEDULER_WORKER_DIGEST}" >> "$GITHUB_OUTPUT"
        log_info "Wrote scheduler_worker_image to GITHUB_OUTPUT"
    fi
else
    log_warn "scheduler-worker image not found locally, skipping push"
    log_warn "Run build-service.sh first to build scheduler-worker"
fi

log_info ""
log_info "✅ All images pushed successfully!"
log_info ""
log_info "Next step: Run deploy.sh with:"
log_info "  APP_IMAGE=$APP_IMAGE"
log_info "  MIGRATOR_IMAGE=$MIGRATOR_IMAGE"
if [[ -n "${SCHEDULER_WORKER_IMAGE_DIGEST:-}" ]]; then
    log_info "  SCHEDULER_WORKER_IMAGE=$SCHEDULER_WORKER_IMAGE_DIGEST"
fi

