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

# Check if Docker daemon is running
check_docker_daemon() {
    if docker info >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Check if docker compose v2 is available
check_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Install Docker Desktop on macOS
install_docker_macos() {
    # Check for Homebrew
    if ! command -v brew >/dev/null 2>&1; then
        log_error "Homebrew not found. Please install Homebrew first:"
        log_error "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        exit 1
    fi

    # Check if Docker Desktop is already installed (app exists)
    if [[ -d "/Applications/Docker.app" ]]; then
        log_info "Docker Desktop is already installed"
    else
        log_info "Installing Docker Desktop via Homebrew..."
        brew install --cask docker
        log_info "Docker Desktop installed"
    fi
}

# Wait for Docker daemon with timeout
wait_for_docker() {
    local max_attempts=30
    local attempt=1

    log_info "Waiting for Docker daemon to start..."
    while [[ $attempt -le $max_attempts ]]; do
        if check_docker_daemon; then
            log_info "Docker daemon is running"
            return 0
        fi
        sleep 2
        ((attempt++))
    done

    return 1
}

# Main installation flow
if [[ "$OSTYPE" == "darwin"* ]]; then
    install_docker_macos

    # Check if daemon is running
    if ! check_docker_daemon; then
        log_warn "Docker daemon is not running."
        log_info "Launching Docker Desktop..."
        open -a Docker

        if ! wait_for_docker; then
            log_error "Docker daemon did not start in time."
            log_error "Please launch Docker Desktop manually and wait for it to start."
            log_error "Then re-run this script or run: pnpm dev:stack"
            exit 1
        fi
    fi

    # Verify docker compose v2
    if ! check_docker_compose; then
        log_error "docker compose v2 not available."
        log_error "Please ensure Docker Desktop is up to date."
        exit 1
    fi

    log_info "Docker compose $(docker compose version --short) available"

else
    # Linux/other
    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker not found. Please install Docker:"
        log_error "  https://docs.docker.com/engine/install/"
        exit 1
    fi

    if ! check_docker_daemon; then
        log_error "Docker daemon is not running. Please start it:"
        log_error "  sudo systemctl start docker"
        exit 1
    fi

    if ! check_docker_compose; then
        log_error "docker compose v2 not available."
        log_error "Please install docker-compose-plugin:"
        log_error "  https://docs.docker.com/compose/install/"
        exit 1
    fi
fi

log_info "✅ Docker installation complete!"
