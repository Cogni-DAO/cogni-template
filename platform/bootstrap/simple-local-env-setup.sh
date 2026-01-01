#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Simple .env.local setup - copies example file if .env.local doesn't exist
# Note: A more comprehensive TypeScript-based env setup is planned

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Get repo root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENV_LOCAL="$REPO_ROOT/.env.local"
ENV_EXAMPLE="$REPO_ROOT/.env.local.example"

if [[ -f "$ENV_LOCAL" ]]; then
    log_info ".env.local already exists"
else
    if [[ -f "$ENV_EXAMPLE" ]]; then
        cp "$ENV_EXAMPLE" "$ENV_LOCAL"
        log_info "Created .env.local from .env.local.example"
        log_warn "Please edit .env.local and add your OpenRouter API key"
    else
        log_warn ".env.local.example not found, cannot create .env.local"
        exit 1
    fi
fi
