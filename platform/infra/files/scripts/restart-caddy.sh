#!/usr/bin/env bash
# SPDX-License-Identifier: PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni DAO

set -euo pipefail

echo "Restarting Caddy container..."

# Stop and remove existing caddy container
docker rm -f caddy || true

# Start fresh caddy container
docker run -d \
    --name caddy \
    --network web \
    --restart=always \
    -p 80:80 \
    -p 443:443 \
    -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
    -v caddy_data:/data \
    -v caddy_config:/config \
    caddy:2

echo "✅ Caddy restarted"
docker ps --filter name=caddy