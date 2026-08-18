#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2026 Cogni-DAO

# Pure reader for infra/deployment-parents.json. This file is sourced by
# renderers and read-only workflow guards; it never mutates deploy state.

DEPLOYMENT_PARENT_REPO_ROOT="${DEPLOYMENT_PARENT_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
DEPLOYMENT_PARENT_CONTRACT="${DEPLOYMENT_PARENT_CONTRACT:-$DEPLOYMENT_PARENT_REPO_ROOT/infra/deployment-parents.json}"

deployment_parent_slug() {
  local env="$1"
  jq -er --arg env "$env" '.[$env] | select(.owner != null and .repo != null) | "\(.owner)/\(.repo)"' \
    "$DEPLOYMENT_PARENT_CONTRACT"
}

deployment_parent_repo_url() {
  printf 'https://github.com/%s.git\n' "$(deployment_parent_slug "$1")"
}

assert_deployment_parent_repo() {
  local env="$1" actual="$2" expected
  expected="$(deployment_parent_slug "$env")" || {
    echo "[ERROR] no deployment parent declared for environment '$env'" >&2
    return 1
  }
  if [[ "${actual,,}" != "${expected,,}" ]]; then
    echo "[ERROR] deployment parent mismatch for $env: expected $expected, got $actual" >&2
    return 1
  fi
}
