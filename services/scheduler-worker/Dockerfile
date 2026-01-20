# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Multi-stage Dockerfile for scheduler-worker service
# Builds a minimal production image with bundled JS

# ============================================================
# Stage 1: Build
# ============================================================
FROM node:20-bookworm-slim AS builder

# Install build tools for native modules (bufferutil, etc. from shared lockfile)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm (pinned to match root package.json packageManager field)
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

WORKDIR /app

# Copy workspace config for dependency resolution
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/scheduler-core/package.json packages/scheduler-core/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/db-client/package.json packages/db-client/
COPY services/scheduler-worker/package.json services/scheduler-worker/

# Install only dependencies needed for this service (not entire workspace)
RUN pnpm install --frozen-lockfile --filter @cogni/scheduler-worker-service...

# Copy source files for packages that need to be built
COPY packages/scheduler-core packages/scheduler-core
COPY packages/db-schema packages/db-schema
COPY packages/db-client packages/db-client
COPY services/scheduler-worker services/scheduler-worker

# Build packages in dependency order
RUN pnpm --filter @cogni/scheduler-core build && \
    pnpm --filter @cogni/db-schema build && \
    pnpm --filter @cogni/db-client build && \
    pnpm --filter @cogni/scheduler-worker-service build

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:20-bookworm-slim AS runner

# Don't run as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker
USER worker

WORKDIR /app

# Copy only the bundled output
COPY --from=builder --chown=worker:nodejs /app/services/scheduler-worker/dist ./dist

# No Docker HEALTHCHECK - use K8s probes instead (per SERVICES_ARCHITECTURE.md)

ENV NODE_ENV=production

CMD ["node", "dist/main.js"]
