#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Script: platform/ci/scripts/probe-repo-volume.sh
# Purpose: Validate git-sync volume is mounted and usable inside the app container.
# Catches UID mismatches (dubious ownership), mount failures, and missing binaries.

set -euo pipefail

docker exec app sh -lc 'git -C /repo/current rev-parse HEAD | grep -Eq "^[0-9a-f]{40}$"'
docker exec app sh -lc 'git -C /repo/current ls-files -- LICENSE* | grep -q LICENSE'
docker exec app sh -lc 'rg --version | head -n1 | grep -q "^ripgrep "'
