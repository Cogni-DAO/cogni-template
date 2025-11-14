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


# Ensure IMAGE_NAME is lowercase for Docker registry compatibility
IMAGE_NAME=$(echo "${IMAGE_NAME}" | tr '[:upper:]' '[:lower:]')

# Set full image reference
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

log_info "Pushing Docker image to GHCR..."
log_info "Image: $FULL_IMAGE"

# Verify image exists locally first
if ! docker inspect "$FULL_IMAGE" > /dev/null 2>&1; then
    log_error "Image $FULL_IMAGE not found locally. Run build.sh first."
    exit 1
fi


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

