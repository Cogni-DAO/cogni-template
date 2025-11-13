#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

echo "Ensuring Docker volumes exist..."

# Create named volumes if they don't exist
docker volume create caddy_data || true
docker volume create caddy_config || true

echo "✅ Docker volumes ready"