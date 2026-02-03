# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Sandbox Runtime Container
# One-shot container for network-isolated command execution.
# Per SANDBOXED_AGENTS.md P0: ephemeral per command, no long-lived sessions.

FROM node:20-slim

# Install minimal tools needed for sandbox operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    jq \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN addgroup --system --gid 1001 sandbox && \
    adduser --system --uid 1001 --gid 1001 sandboxer

USER sandboxer
WORKDIR /workspace

# One-shot entrypoint: runs provided command then exits
# Usage: docker run --rm --network=none <image> 'your command here'
ENTRYPOINT ["/bin/bash", "-lc"]
