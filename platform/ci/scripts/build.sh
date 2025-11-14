#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

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

# Set full image reference
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

log_info "Building Docker image..."
log_info "Image: $FULL_IMAGE"
log_info "Platform: linux/amd64 (Cherry Servers compatible)"

# Build with explicit platform for Cherry Servers (x86_64)
log_info "Starting Docker build..."
docker build \
    --platform linux/amd64 \
    --tag "$FULL_IMAGE" \
    --label "org.opencontainers.image.source=https://github.com/cogni-dao/cogni-template" \
    --label "org.opencontainers.image.revision=${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo 'unknown')}" \
    --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --label "org.opencontainers.image.title=cogni-template" \
    .

# Verify image was created successfully
if docker inspect "$FULL_IMAGE" > /dev/null 2>&1; then
    log_info "✅ Build successful!"
    log_info ""
    log_info "Image details:"
    docker inspect "$FULL_IMAGE" --format '  Size: {{.Size}} bytes'
    docker inspect "$FULL_IMAGE" --format '  Created: {{.Created}}'
    docker inspect "$FULL_IMAGE" --format '  Platform: {{.Os}}/{{.Architecture}}'
    log_info ""
    log_info "Healthcheck configured: $(docker inspect "$FULL_IMAGE" --format '{{if .Config.Healthcheck}}Yes{{else}}No{{end}}')"
    log_info "Next step: Run push.sh to push to GHCR"
else
    log_error "Build verification failed - image not found (maybe you're on ARM, the build was x64)"
    exit 1
fi