#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2026 Cogni-DAO

# Fail-closed workflow guard: the workflow repository must be the deployment
# parent declared for the target environment before any deploy branch is written.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/ci/lib/deployment-parent.sh
source "$SCRIPT_DIR/lib/deployment-parent.sh"

env="${1:-${DEPLOY_ENVIRONMENT:-}}"
actual="${2:-${GITHUB_REPOSITORY:-}}"
[[ -n "$env" ]] || { echo "[ERROR] deployment environment is required" >&2; exit 1; }
[[ -n "$actual" ]] || { echo "[ERROR] workflow repository is required" >&2; exit 1; }

assert_deployment_parent_repo "$env" "$actual"
echo "Deployment parent verified: $env -> $actual"
