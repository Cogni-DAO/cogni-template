#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

# Error trap with cleanup
trap 'code=$?; echo "[ERROR] image test failed"; docker rm -f test-container 2>/dev/null || true; exit $code' ERR

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

# Validate image reference
if [[ -n "${FULL_IMAGE:-}" ]]; then
    IMAGE_REF="$FULL_IMAGE"
elif [[ -n "${IMAGE_NAME:-}" ]] && [[ -n "${IMAGE_TAG:-}" ]]; then
    IMAGE_REF="${IMAGE_NAME}:${IMAGE_TAG}"
else
    log_error "Either FULL_IMAGE or (IMAGE_NAME + IMAGE_TAG) required"
    exit 1
fi

log_info "Testing image: $IMAGE_REF"

# Start test container with hardcoded test environment
log_info "Starting test container..."
docker run -d --name test-container \
    -p 3000:3000 \
    -e NODE_ENV=production \
    -e APP_ENV=test \
    -e LITELLM_MASTER_KEY=test-build-validation-key \
    -e DATABASE_URL=postgresql://testuser:testpass@localhost:5432/testdb \
    "${IMAGE_REF}"

# Wait for Docker healthcheck to pass
log_info "Waiting for Docker healthcheck..."
for i in {1..30}; do
    STATUS=$(docker inspect test-container --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")

    if [[ "$STATUS" == "healthy" ]]; then
        log_info "✅ Docker healthcheck passed"
        break
    elif [[ "$STATUS" == "unhealthy" ]]; then
        log_error "Docker healthcheck reported unhealthy"
        docker logs test-container
        exit 1
    elif [[ $i -eq 30 ]]; then
        log_error "Docker healthcheck timeout (60s)"
        log_error "Final status: $STATUS"
        docker logs test-container
        exit 1
    else
        log_info "Attempt $i/30: healthcheck=$STATUS, waiting..."
        sleep 2
    fi
done

# Test health endpoint directly
log_info "Testing health endpoint..."
for i in {1..10}; do
    if curl -fsS http://localhost:3000/api/v1/meta/health >/dev/null 2>&1; then
        log_info "✅ Health endpoint responding correctly"
        RESPONSE=$(curl -s http://localhost:3000/api/v1/meta/health)
        log_info "Response: $RESPONSE"
        break
    elif [[ $i -eq 10 ]]; then
        log_error "Health endpoint test failed (30s timeout)"
        log_error "Attempting to fetch response for debugging:"
        curl -v http://localhost:3000/api/v1/meta/health 2>&1 || true
        log_error ""
        log_error "Container logs:"
        docker logs test-container
        exit 1
    else
        log_info "Attempt $i/10: health endpoint not ready, waiting..."
        sleep 3
    fi
done

# Cleanup
log_info "Cleaning up test container..."
docker rm -f test-container

log_info "✅ Image test passed successfully"
