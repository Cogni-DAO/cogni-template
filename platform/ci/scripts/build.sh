#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Script: platform/ci/scripts/build.sh
# Purpose: Build APP_IMAGE (runner) and MIGRATOR_IMAGE (migrator) from Dockerfile.
# Invariants:
#   - Both images share the same commit SHA in their tags
#   - Tag coupling: APP_IMAGE=IMAGE_NAME:IMAGE_TAG, MIGRATOR_IMAGE=IMAGE_NAME:IMAGE_TAG-migrate

set -euo pipefail

# Ensure BuildKit is enabled for cache mount support
export DOCKER_BUILDKIT=1

# Error trap
trap 'code=$?; echo "[ERROR] build failed"; exit $code' ERR

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

# Export for push.sh to consume
export APP_IMAGE MIGRATOR_IMAGE

# Common build labels
BUILD_LABELS=(
    --label "org.opencontainers.image.source=https://github.com/cogni-dao/cogni-template"
    --label "org.opencontainers.image.revision=${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
)

# Platform selection: default to native locally, linux/amd64 in CI
# CI sets PLATFORM=linux/amd64; local dev uses native to avoid QEMU emulation slowness
PLATFORM="${PLATFORM:-}"
PLATFORM_ARGS=()
if [[ -n "$PLATFORM" ]]; then
    PLATFORM_ARGS=(--platform "$PLATFORM")
    log_info "Platform: $PLATFORM"
else
    log_info "Platform: native (set PLATFORM=linux/amd64 for CI builds)"
fi

log_info "Building Docker images..."
log_info "App image: $APP_IMAGE"
log_info "Migrator image: $MIGRATOR_IMAGE"

# Build app image (runner target)
log_info ""
log_info "=== Building app image (runner target) ==="
docker build \
    ${PLATFORM_ARGS[@]+"${PLATFORM_ARGS[@]}"} \
    --target runner \
    --tag "$APP_IMAGE" \
    "${BUILD_LABELS[@]}" \
    --label "org.opencontainers.image.title=cogni-template" \
    .

# Build migrator image (migrator target)
log_info ""
log_info "=== Building migrator image (migrator target) ==="
docker build \
    ${PLATFORM_ARGS[@]+"${PLATFORM_ARGS[@]}"} \
    --target migrator \
    --tag "$MIGRATOR_IMAGE" \
    "${BUILD_LABELS[@]}" \
    --label "org.opencontainers.image.title=cogni-template-migrate" \
    .

# Verify app image was created successfully
log_info ""
log_info "=== Verifying builds ==="
if docker inspect "$APP_IMAGE" > /dev/null 2>&1; then
    log_info "✅ App image build successful!"
    log_info "  Size: $(docker inspect "$APP_IMAGE" --format '{{.Size}}') bytes"
    log_info "  Healthcheck: $(docker inspect "$APP_IMAGE" --format '{{if .Config.Healthcheck}}Yes{{else}}No{{end}}')"
else
    log_error "App image build verification failed"
    exit 1
fi

if docker inspect "$MIGRATOR_IMAGE" > /dev/null 2>&1; then
    log_info "✅ Migrator image build successful!"
    log_info "  Size: $(docker inspect "$MIGRATOR_IMAGE" --format '{{.Size}}') bytes"
else
    log_error "Migrator image build verification failed"
    exit 1
fi

log_info ""
log_info "Next step: Run push.sh to push both images to GHCR"
log_info "  APP_IMAGE=$APP_IMAGE"
log_info "  MIGRATOR_IMAGE=$MIGRATOR_IMAGE"