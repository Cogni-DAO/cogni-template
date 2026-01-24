#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Script: platform/ci/scripts/build-service.sh
# Purpose: Build scheduler-worker service image from its Dockerfile.
# Invariants:
#   - Tag format: IMAGE_NAME:IMAGE_TAG-scheduler-worker
#   - Uses docker build (not buildx) to match existing flow
#   - P0 scope: scheduler-worker only, no generalized service loops

set -euo pipefail

# Ensure BuildKit is enabled for cache mount support
export DOCKER_BUILDKIT=1

# Error trap
trap 'code=$?; echo "[ERROR] build-service failed"; exit $code' ERR

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
    log_error "IMAGE_TAG is required (e.g., prod-abc123)"
    exit 1
fi

# Ensure IMAGE_NAME is lowercase for Docker registry compatibility
IMAGE_NAME=$(echo "${IMAGE_NAME}" | tr '[:upper:]' '[:lower:]')

# Derive service image tag
SCHEDULER_WORKER_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}-scheduler-worker"

# Export for push.sh to consume
export SCHEDULER_WORKER_IMAGE

# Build metadata
GIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}"
BUILD_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Common build labels
BUILD_LABELS=(
    --label "org.opencontainers.image.source=https://github.com/cogni-dao/cogni-template"
    --label "org.opencontainers.image.revision=${GIT_SHA}"
    --label "org.opencontainers.image.created=${BUILD_TS}"
    --label "org.opencontainers.image.title=scheduler-worker"
    --label "cogni.service=scheduler-worker"
    --label "cogni.build.sha=${GIT_SHA}"
    --label "cogni.build.ts=${BUILD_TS}"
)

# Platform selection: default to native locally, linux/amd64 in CI
PLATFORM="${PLATFORM:-}"
PLATFORM_ARGS=()
if [[ -n "$PLATFORM" ]]; then
    PLATFORM_ARGS=(--platform "$PLATFORM")
    log_info "Platform: $PLATFORM"
else
    log_info "Platform: native (set PLATFORM=linux/amd64 for CI builds)"
fi

log_info "Building scheduler-worker service image..."
log_info "Image: $SCHEDULER_WORKER_IMAGE"

# Build scheduler-worker image
docker build \
    ${PLATFORM_ARGS[@]+"${PLATFORM_ARGS[@]}"} \
    --tag "$SCHEDULER_WORKER_IMAGE" \
    --build-arg "GIT_SHA=${GIT_SHA}" \
    --build-arg "BUILD_TS=${BUILD_TS}" \
    "${BUILD_LABELS[@]}" \
    -f services/scheduler-worker/Dockerfile \
    .

# Verify image was created successfully
log_info ""
log_info "=== Verifying build ==="
if docker inspect "$SCHEDULER_WORKER_IMAGE" > /dev/null 2>&1; then
    log_info "✅ scheduler-worker image build successful!"
    log_info "  Size: $(docker inspect "$SCHEDULER_WORKER_IMAGE" --format '{{.Size}}') bytes"
else
    log_error "scheduler-worker image build verification failed"
    exit 1
fi

log_info ""
log_info "Next step: Run push.sh to push image to GHCR"
log_info "  SCHEDULER_WORKER_IMAGE=$SCHEDULER_WORKER_IMAGE"
