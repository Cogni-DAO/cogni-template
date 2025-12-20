#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Module: scripts/check-full.sh
# Purpose: Local CI-parity gate that orchestrates the full test suite with infrastructure.
#          Runs the exact same commands CI runs, but orchestrated for local convenience.
# Usage: pnpm check:full           # Full build + all tests
#        pnpm check:full:fast      # Skip Docker rebuild (use existing images)
#        bash scripts/check-full.sh [--skip-build]
# Exit: 0 if all tests pass, 1 if any test fails or setup fails
# Shell options:
#   - set -e: Fail fast on any command failure (except in preflight checks)
#   - set -o pipefail: Catches failures in piped commands
#   - set -u: Treats unbound variables as errors
# Side-effects: Starts/stops Docker containers; creates/drops test database
# Invariants:
#   - Always tears down stack (trap ensures cleanup even on failure/interrupt)
#   - Verifies .env.test exists; delegates to docker/test commands that use --env-file .env.test
#   - Runs tests in same order as CI for consistency
# Links: package.json, .env.test, docker-compose.dev.yml, CI workflow

set -e
set -o pipefail
set -u

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Configuration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SKIP_BUILD=false
STACK_STARTED=false
START_TIME=$(date +%s)

# Parse arguments
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=true
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Helper Functions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

log_step() {
  echo ""
  echo "[$1] $2"
}

log_success() {
  local duration=$1
  echo "✓ Completed in ${duration}s"
}

log_error() {
  echo "✗ $1"
}

check_port() {
  local port=$1

  # Try lsof (macOS, some Linux)
  if command -v lsof >/dev/null 2>&1; then
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
      return 1
    fi
    return 0
  fi

  # Try ss (modern Linux)
  if command -v ss >/dev/null 2>&1; then
    if ss -ltn | grep -q ":$port "; then
      return 1
    fi
    return 0
  fi

  # No port-checking tool available - warn but don't fail
  echo "  ! Cannot check port $port (no lsof/ss available - skipping)"
  return 0
}

cleanup_and_exit() {
  local exit_code=$?
  set +e  # Disable fail-fast during cleanup to preserve original exit code

  # Print result signal for automated parsing (on error only; success is handled in main flow)
  if [ $exit_code -ne 0 ]; then
    echo "CHECK_FULL_RESULT=FAIL"
  fi

  # Teardown infrastructure
  if [ "$STACK_STARTED" = true ]; then
    log_section "Tearing down test stack..."
    pnpm docker:test:stack:down || log_error "Failed to tear down stack (containers may still be running)"
  fi

  exit $exit_code
}

# Always cleanup on exit (success, failure, or interrupt)
trap cleanup_and_exit EXIT INT TERM

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main Execution
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_section "check:full - CI-Parity Test Gate"

if [ "$SKIP_BUILD" = true ]; then
  echo "Mode: Fast (skip Docker rebuild)"
else
  echo "Mode: Full (rebuild Docker images)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 0: Verify .env.test exists
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "0/5" "Verifying .env.test configuration..."

if [ ! -f .env.test ]; then
  log_error ".env.test not found. Create it from .env.test.example"
  exit 1
fi
echo "  ✓ .env.test exists"

# Export marker so downstream scripts know we're in check:full context
export CHECK_FULL_MODE=true

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Pre-flight checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "1/5" "Pre-flight checks..."

set +e  # Don't fail fast for port checks
if ! check_port 55432; then
  log_error "Port 55432 already in use (test postgres). Run: pnpm docker:test:stack:down"
  exit 1
fi
echo "  ✓ Port 55432 available"

if ! check_port 4000; then
  log_error "Port 4000 already in use (litellm). Run: pnpm docker:test:stack:down"
  exit 1
fi
echo "  ✓ Port 4000 available"
set -e  # Re-enable fail fast

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Start test stack
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "2/5" "Starting test stack..."
step_start=$(date +%s)

if [ "$SKIP_BUILD" = true ]; then
  pnpm docker:test:stack:fast
else
  pnpm docker:test:stack
fi

STACK_STARTED=true  # Mark for cleanup
step_duration=$(($(date +%s) - step_start))
log_success "$step_duration"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Provision and migrate test database
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "3/5" "Provisioning test database..."
step_start=$(date +%s)

pnpm docker:test:stack:setup

step_duration=$(($(date +%s) - step_start))
log_success "$step_duration"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Build workspace packages (required for host-run tests)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "4/5" "Building workspace packages (JS + declarations)..."
step_start=$(date +%s)

# Canonical command: tsup (JS) + tsc -b (declarations) + validation
# Docker build creates dist/ inside container; tests run on host and need host dist/
pnpm packages:build

step_duration=$(($(date +%s) - step_start))
log_success "$step_duration"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 5: Run test suites (same order as CI)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

log_step "5/5" "Running test suites..."

# Unit tests (fast, no infrastructure)
echo ""
echo "  → test:unit"
step_start=$(date +%s)
pnpm test:unit
step_duration=$(($(date +%s) - step_start))
echo "    ✓ Passed (${step_duration}s)"

# Integration tests (testcontainers)
echo ""
echo "  → test:int"
step_start=$(date +%s)
pnpm test:int
step_duration=$(($(date +%s) - step_start))
echo "    ✓ Passed (${step_duration}s)"

# Contract tests (in-memory, no HTTP)
echo ""
echo "  → test:contract"
step_start=$(date +%s)
pnpm test:contract
step_duration=$(($(date +%s) - step_start))
echo "    ✓ Passed (${step_duration}s)"

# Stack tests (full HTTP + DB)
echo ""
echo "  → test:stack:docker"
step_start=$(date +%s)
pnpm test:stack:docker
step_duration=$(($(date +%s) - step_start))
echo "    ✓ Passed (${step_duration}s)"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

total_duration=$(($(date +%s) - START_TIME))

log_section "SUMMARY"
echo "✓ All tests passed (${total_duration}s total)"
log_section ""

# Print result signal for automated parsing
echo "CHECK_FULL_RESULT=PASS"
