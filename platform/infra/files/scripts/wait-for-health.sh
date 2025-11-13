#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

HEALTH_URL="${1:-}"

if [[ -z "$HEALTH_URL" ]]; then
    echo "Usage: $0 <health-url>"
    echo "Example: $0 https://canary.cognidao.org/api/v1/meta/health"
    exit 1
fi

echo "Waiting for $HEALTH_URL to be healthy..."

for i in {1..60}; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        echo "✅ Health check passed after ${i} attempts"
        exit 0
    fi
    echo "Attempt $i/60 failed, waiting 5 seconds..."
    sleep 5
done

echo "❌ Health check failed after 60 attempts (5 minutes)"
exit 1