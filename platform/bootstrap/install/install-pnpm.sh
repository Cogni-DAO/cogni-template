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

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Install Volta (Node version manager)
install_volta() {
    if command -v volta >/dev/null 2>&1; then
        log_info "Volta is already installed"
        return 0
    fi

    log_info "Installing Volta (Node version manager)..."
    curl https://get.volta.sh | bash

    # Source volta for current session
    export VOLTA_HOME="$HOME/.volta"
    export PATH="$VOLTA_HOME/bin:$PATH"

    if command -v volta >/dev/null 2>&1; then
        log_info "Volta installed successfully"
    else
        log_error "Volta installation failed. Please install manually: https://volta.sh"
        exit 1
    fi

    # Ensure Volta is in shell profile (installer sometimes skips this)
    ensure_volta_in_profile
}

# Add Volta to shell profile if not already present
ensure_volta_in_profile() {
    local shell_profile=""

    # Determine shell profile
    if [[ -n "${ZSH_VERSION:-}" ]] || [[ "$SHELL" == *"zsh"* ]]; then
        shell_profile="$HOME/.zshrc"
    elif [[ -n "${BASH_VERSION:-}" ]] || [[ "$SHELL" == *"bash"* ]]; then
        shell_profile="$HOME/.bashrc"
    fi

    if [[ -z "$shell_profile" ]]; then
        log_warn "Could not determine shell profile. Add manually:"
        log_warn '  export VOLTA_HOME="$HOME/.volta"'
        log_warn '  export PATH="$VOLTA_HOME/bin:$PATH"'
        return
    fi

    # Check if already configured
    if grep -q "VOLTA_HOME" "$shell_profile" 2>/dev/null; then
        return
    fi

    # Add Volta to profile
    log_info "Adding Volta to $shell_profile..."
    cat >> "$shell_profile" << 'EOF'

# Volta (Node version manager)
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"
EOF
    log_info "Volta added to shell profile. Restart your terminal or run: source $shell_profile"
}

# Ensure Volta is in PATH for current session
ensure_volta_path() {
    if ! command -v volta >/dev/null 2>&1; then
        export VOLTA_HOME="$HOME/.volta"
        export PATH="$VOLTA_HOME/bin:$PATH"
    fi
}

# Install Node.js 20 via Volta
install_node() {
    ensure_volta_path

    log_info "Installing Node.js 20 via Volta..."
    volta install node@20

    # Verify installation
    local node_version
    node_version=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v')
    if [[ "$node_version" == "20" ]]; then
        log_info "Node.js $(node -v) installed successfully"
    else
        log_error "Node.js 20 installation failed. Got: $(node -v 2>/dev/null || echo 'not found')"
        exit 1
    fi
}

# Install pnpm via Volta
install_pnpm() {
    ensure_volta_path

    log_info "Installing pnpm via Volta..."
    volta install pnpm@9

    if command -v pnpm >/dev/null 2>&1; then
        log_info "pnpm $(pnpm -v) installed successfully"
    else
        log_error "pnpm installation failed"
        exit 1
    fi
}

# Main installation flow
install_volta
install_node
install_pnpm

log_info "✅ Volta/Node/pnpm installation complete!"
