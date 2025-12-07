#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Script: platform/ci/scripts/compute_migrator_fingerprint.sh
# Purpose: Compute content-based fingerprint for migrator image
# Returns: 12-char hex fingerprint (stdout) based on hash of migrator inputs
# Usage: MIGRATOR_FINGERPRINT=$(platform/ci/scripts/compute_migrator_fingerprint.sh)

set -euo pipefail

# Migrator input paths (order matters for stable hashing)
MIGRATOR_INPUTS=(
    "drizzle.config.ts"
    "src/shared/db"
    "src/adapters/server/db/migrations"
    "package.json"
    "pnpm-lock.yaml"
    "Dockerfile"
)

# Create concatenated hash of all inputs
COMBINED_HASH=""
for input in "${MIGRATOR_INPUTS[@]}"; do
    if [[ -f "$input" ]]; then
        # File: hash content
        HASH=$(git hash-object "$input")
    elif [[ -d "$input" ]]; then
        # Directory: hash tree
        HASH=$(git ls-tree -r HEAD "$input" | git hash-object --stdin)
    else
        echo "[ERROR] Migrator input not found: $input" >&2
        exit 1
    fi
    COMBINED_HASH="${COMBINED_HASH}${HASH}"
done

# Final fingerprint: hash of all hashes, truncated to 12 chars
FINGERPRINT=$(echo -n "$COMBINED_HASH" | git hash-object --stdin | cut -c1-12)

echo "$FINGERPRINT"
