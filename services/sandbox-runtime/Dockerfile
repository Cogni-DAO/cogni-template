# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Sandbox Runtime Container
# One-shot container for network-isolated command execution.
# Per SANDBOXED_AGENTS.md P0.5: ephemeral per command, LLM access via socket bridge.

FROM node:20-slim

# Install minimal tools needed for sandbox operations
# socat: bridges localhost:8080 to mounted unix socket for LLM access (P0.5)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    jq \
    curl \
    socat \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN addgroup --system --gid 1001 sandbox && \
    adduser --system --uid 1001 --gid 1001 sandboxer

# Copy entrypoint script (runs socat bridge before main command)
COPY --chmod=755 entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh

USER sandboxer
WORKDIR /workspace

# Entrypoint: starts socat bridge, then runs provided command
# Usage: docker run --rm --network=none --mount type=volume,src=llm-socket-XXX,target=/llm-sock <image> 'your command'
ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint.sh"]
