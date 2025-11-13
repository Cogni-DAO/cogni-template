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

# Install Node.js and pnpm
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Check for Homebrew
    if ! check_command brew; then
        log_warn "Homebrew not found. Please install Homebrew first."
        exit 1
    fi
    
    install_brew_package node
    install_brew_package pnpm
else
    if ! check_command node; then
        log_warn "Non-macOS system detected. Please install manually:"
        log_warn "- Node.js (via nvm or package manager)"
    fi
    if ! check_command pnpm; then
        log_warn "- pnpm (npm install -g pnpm)"
    fi
fi

# Install Node.js dependencies and setup git hooks
if check_command pnpm; then
    log_info "Installing Node.js dependencies..."
    pnpm install

    log_info "Setting up git hooks..."
    pnpm prepare
else
    log_warn "pnpm not available, skipping project setup"
fi

log_info "✅ Node.js/pnpm installation complete!"