#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Project bootstrap: install dependencies and set up git hooks
# Requires: Node.js and pnpm already installed (via install-pnpm.sh)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$REPO_ROOT"

# Assert we're in a valid repo root
if [[ ! -f "package.json" ]] || [[ ! -f "pnpm-workspace.yaml" ]]; then
    log_error "Not in a valid project root (missing package.json or pnpm-workspace.yaml)"
    exit 1
fi

# Check pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
    log_error "pnpm not found. Run install-pnpm.sh first."
    exit 1
fi

# Install dependencies
log_info "Installing project dependencies..."
pnpm install

# Build workspace packages (required before app can import from them)
log_info "Building workspace packages..."
pnpm packages:build

# Set up git hooks (if prepare script exists)
if grep -q '"prepare"' package.json 2>/dev/null; then
    log_info "Setting up git hooks..."
    pnpm prepare
fi

log_info "✅ Project bootstrap complete!"
