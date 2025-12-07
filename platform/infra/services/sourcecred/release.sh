
#!/usr/bin/env bash
set -euo pipefail

# Usage: ./release.sh <tag>
# Example: ./release.sh sc0.11.2-node18-2025-12-07

TAG="${1:?usage: release.sh <tag>}"
IMAGE="ghcr.io/cogni-dao/cogni-sourcecred-runner:${TAG}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "Building and pushing $IMAGE..."

# Build context is the sourcecred service directory
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f "$SCRIPT_DIR/Dockerfile.sourcecred" \
  -t "$IMAGE" \
  --push \
  "$SCRIPT_DIR"

echo "✅ Pushed $IMAGE"
