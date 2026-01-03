#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

log_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Parse arguments
INSTALL_ALL=false
for arg in "$@"; do
    case $arg in
        --all)
            INSTALL_ALL=true
            shift
            ;;
        -h|--help)
            echo "Usage: setup.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --all     Install all tools (includes OpenTofu, REUSE)"
            echo "  -h        Show this help message"
            echo ""
            echo "By default, only Node.js/pnpm and Docker are installed."
            exit 0
            ;;
    esac
done

# Get script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALL_DIR="$SCRIPT_DIR/install"

cd "$REPO_ROOT"

echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Cogni Template - Development Setup                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}\n"

# Determine step count
if [[ "$INSTALL_ALL" == "true" ]]; then
    TOTAL_STEPS=5
else
    TOTAL_STEPS=3
fi

CURRENT_STEP=0

# Step 1: Node.js & pnpm (via Volta)
((CURRENT_STEP++))
log_step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: Installing Node.js & pnpm (via Volta)"
"$INSTALL_DIR/install-pnpm.sh"

# Step 2: Docker
((CURRENT_STEP++))
log_step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: Installing Docker"
"$INSTALL_DIR/install-docker.sh"

# Step 3: Project dependencies and packages
((CURRENT_STEP++))
log_step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: Installing project dependencies"
"$INSTALL_DIR/install-project.sh"

# Optional: OpenTofu (infrastructure)
if [[ "$INSTALL_ALL" == "true" ]]; then
    ((CURRENT_STEP++))
    log_step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: Installing OpenTofu (Infrastructure)"
    "$INSTALL_DIR/install-tofu.sh"
fi

# Optional: REUSE (license compliance)
if [[ "$INSTALL_ALL" == "true" ]]; then
    ((CURRENT_STEP++))
    log_step "Step ${CURRENT_STEP}/${TOTAL_STEPS}: Installing REUSE (License Compliance)"
    "$INSTALL_DIR/install-reuse.sh"
fi

echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              Installation Complete!                          ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}\n"

log_info "All tools and dependencies installed successfully."

if [[ "$INSTALL_ALL" != "true" ]]; then
    log_info "Note: Run with --all to also install OpenTofu and REUSE."
fi

# Fail-fast checks before offering dev:stack
echo ""
log_info "Running pre-flight checks..."

# Ensure Volta PATH is set (may not be in current shell after fresh install)
export VOLTA_HOME="${VOLTA_HOME:-$HOME/.volta}"
export PATH="$VOLTA_HOME/bin:$PATH"

# Check Node version
NODE_VERSION=$(node -v 2>/dev/null | cut -d'.' -f1 | tr -d 'v' || echo "0")
if [[ "$NODE_VERSION" != "20" ]]; then
    log_error "Node.js 20.x required, but got: $(node -v 2>/dev/null || echo 'not found')"
    log_error "Please restart your terminal to pick up Volta PATH changes, then re-run."
    exit 1
fi
log_info "✓ Node.js $(node -v)"

# Check Docker daemon
if ! docker info >/dev/null 2>&1; then
    log_error "Docker daemon is not running."
    log_error "Please run: open -a Docker"
    log_error "Wait for Docker to start, then run: pnpm dev:stack"
    exit 1
fi
log_info "✓ Docker daemon running"

# Check docker compose
if ! docker compose version >/dev/null 2>&1; then
    log_error "docker compose v2 not available."
    exit 1
fi
log_info "✓ Docker compose $(docker compose version --short)"

# Ensure .env.local exists
"$SCRIPT_DIR/simple-local-env-setup.sh"

# Prompt for first-time environment setup
echo ""
log_info "First-time setup provisions databases and runs migrations."
log_info "This is required before running the app or tests."
echo ""
read -p "Set up development environment? (Y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    log_step "Setting up Development Environment"
    log_info "Starting infrastructure containers..."
    if pnpm dev:infra; then
        log_info "Provisioning and migrating dev database..."
        if pnpm db:setup; then
            log_info "✓ Dev environment ready"
        else
            log_error "Failed to set up dev database"
        fi
    else
        log_error "Failed to start dev infrastructure"
    fi
fi

echo ""
read -p "Set up test environment? (Y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    log_step "Setting up Test Environment"
    log_info "Starting test containers and provisioning test database..."
    if pnpm docker:test:stack:setup; then
        log_info "✓ Test environment ready"
        log_info "Stopping test containers (will restart when needed)..."
        pnpm docker:test:stack:down
    else
        log_error "Failed to set up test environment"
    fi
fi

echo ""
log_info "Setup complete! Quick reference:"
echo ""
echo "  pnpm dev:stack          # Start dev server (infra + Next.js)"
echo "  pnpm dev                # Start Next.js only (infra already running)"
echo "  pnpm dev:stack:test     # Start test server (test infra + Next.js)"
echo "  pnpm test:stack:dev     # Run stack tests against test server"
echo "  pnpm check              # Lint + type + format validation"
echo "  pnpm check:full         # Full CI-parity test suite, docker build + test stack"
echo ""
