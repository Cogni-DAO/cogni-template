#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

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

check_command() {
    if command -v "$1" >/dev/null 2>&1; then
        log_info "$1 is already installed"
        return 0
    else
        return 1
    fi
}

install_brew_package() {
    local package=$1
    if ! check_command "$package"; then
        log_info "Installing $package via Homebrew..."
        brew install "$package"
    fi
}

# Install REUSE tool
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Check for Homebrew
    if ! check_command brew; then
        log_warn "Homebrew not found. Please install Homebrew first."
        exit 1
    fi
    
    install_brew_package reuse
else
    if ! check_command reuse; then
        log_warn "Non-macOS system detected. Please install REUSE tool manually:"
        log_warn "- REUSE tool: https://reuse.readthedocs.io/en/stable/readme.html#install"
    fi
fi

log_info "✅ REUSE tool installation complete!"