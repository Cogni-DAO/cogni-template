#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

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

if [[ -z "${GHCR_PAT:-}" ]]; then
    log_error "GHCR_PAT is required (GitHub Container Registry token)"
    exit 1
fi

if [[ -z "${GHCR_USERNAME:-}" ]]; then
    log_error "GHCR_USERNAME is required (GitHub username)"
    exit 1
fi

# Set full image reference
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

log_info "Pushing Docker image to GHCR..."
log_info "Image: $FULL_IMAGE"
log_info "Registry: ghcr.io"
log_info "Username: $GHCR_USERNAME"

# Verify image exists locally first
if ! docker inspect "$FULL_IMAGE" > /dev/null 2>&1; then
    log_error "Image $FULL_IMAGE not found locally. Run build.sh first."
    exit 1
fi

# Authenticate with GHCR
log_info "Authenticating with GitHub Container Registry..."
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

# Push the image
log_info "Pushing image..."
docker push "$FULL_IMAGE"

# Verify push was successful
log_info "Verifying push..."
if docker pull --platform linux/amd64 "$FULL_IMAGE" > /dev/null 2>&1; then
    # Clean up the pulled verification image to save space
    docker rmi "$FULL_IMAGE" > /dev/null 2>&1 || true
    
    log_info "✅ Push successful!"
    log_info ""
    log_info "Image available at: $FULL_IMAGE"
    log_info "Next step: Run deploy.sh with TF_VAR_app_image=$FULL_IMAGE"
else
    log_error "Push verification failed - unable to pull pushed image"
    exit 1
fi

# Clean up credentials
docker logout ghcr.io > /dev/null 2>&1 || true
log_info "GHCR logout completed"