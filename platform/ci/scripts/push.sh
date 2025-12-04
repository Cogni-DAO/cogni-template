#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Script: platform/ci/scripts/push.sh
# Purpose: Push APP_IMAGE and MIGRATOR_IMAGE to GHCR.
# Invariants:
#   - Both images must exist locally (run build.sh first)
#   - Tag coupling: APP_IMAGE=IMAGE_NAME:IMAGE_TAG, MIGRATOR_IMAGE=IMAGE_NAME:IMAGE_TAG-migrate

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

log_info ""
log_info "✅ Both images pushed successfully!"
log_info ""
log_info "Next step: Run deploy.sh with:"
log_info "  APP_IMAGE=$APP_IMAGE"
log_info "  MIGRATOR_IMAGE=$MIGRATOR_IMAGE"

