#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Module: scripts/check-all.sh
# Purpose: Runs all quality checks (typecheck, lint, format, test, docs) to completion,
#          never stopping at first failure. Provides structured output with timing,
#          visual separation, and summary reporting optimized for AI developer workflows.
# Usage: pnpm check      # Read-only validation
#        pnpm check:fix  # Run with auto-fixers
#        Direct: bash scripts/check-all.sh [--fix]
# Exit: 0 if all checks pass, 1 if any check fails
# Shell options:
#   - set +e: Disables fail-fast to ensure all checks run
#   - set -o pipefail: Catches failures in piped commands
#   - set -u: Treats unbound variables as errors
# Side-effects: None in default mode; --fix mode modifies files via ESLint and Prettier
# Links: docs/STYLE.md, AGENTS.md, package.json:41-42

set +e
set -o pipefail
set -u

EXIT_CODE=0
FAILED_CHECKS=()
FIX_MODE=false

# Parse arguments
if [ "${1:-}" = "--fix" ]; then
  FIX_MODE=true
fi

run_check() {
  local name=$1
  local command=$2
  local start=$(date +%s)

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Running $name..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if eval "$command"; then
    local duration=$(($(date +%s) - start))
    echo ""
    echo "✓ $name passed (${duration}s)"
  else
    EXIT_CODE=1
    local duration=$(($(date +%s) - start))
    FAILED_CHECKS+=("$name (${duration}s)")
    echo ""
    echo "✗ $name failed (${duration}s)"
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FIX_MODE" = true ]; then
  echo "Starting checks with auto-fix..."
else
  echo "Starting checks..."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

run_check "typecheck" "pnpm typecheck"

if [ "$FIX_MODE" = true ]; then
  run_check "lint" "pnpm lint:fix"
  run_check "format" "pnpm format"
else
  run_check "lint" "pnpm lint"
  run_check "format:check" "pnpm format:check"
fi

run_check "test" "pnpm test"
run_check "check:docs" "pnpm check:docs"
run_check "check:root-layout" "pnpm check:root-layout"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#FAILED_CHECKS[@]} -eq 0 ]; then
  echo "✓ All checks passed!"
else
  echo "✗ ${#FAILED_CHECKS[@]} check(s) failed:"
  for check in "${FAILED_CHECKS[@]}"; do
    echo "  - $check"
  done
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

exit $EXIT_CODE
