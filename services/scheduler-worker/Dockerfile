# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Multi-stage Dockerfile for Temporal scheduler-worker service
# Model B: transpile-only + runtime node_modules (avoids ESM bundling issues with pino/Temporal)

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
COPY packages/ids/package.json packages/ids/
COPY packages/ai-core/package.json packages/ai-core/
COPY packages/scheduler-core/package.json packages/scheduler-core/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/db-client/package.json packages/db-client/
COPY services/scheduler-worker/package.json services/scheduler-worker/

# Install all dependencies (dev + prod) for build
RUN pnpm install --frozen-lockfile --filter @cogni/scheduler-worker-service...

# Copy source files for packages that need to be built
COPY packages/ids packages/ids
COPY packages/ai-core packages/ai-core
COPY packages/scheduler-core packages/scheduler-core
COPY packages/db-schema packages/db-schema
COPY packages/db-client packages/db-client
COPY services/scheduler-worker services/scheduler-worker

# Build packages in dependency order (transpile-only for service)
RUN pnpm --filter @cogni/ids build && \
    pnpm --filter @cogni/ai-core build && \
    pnpm --filter @cogni/scheduler-core build && \
    pnpm --filter @cogni/db-schema build && \
    pnpm --filter @cogni/db-client build && \
    pnpm --filter @cogni/scheduler-worker-service build

# Prune to production dependencies only
RUN pnpm prune --prod

# ============================================================
# Stage 2: Production
# ============================================================
FROM node:20-bookworm-slim AS runner

# Don't run as root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker
USER worker

WORKDIR /app

# Copy transpiled output and node_modules (Model B)
# TODO: Replace this fragile multi-copy approach with `pnpm deploy` once we can
# run it without resolving the full workspace root.
# Current approach copies both root and service node_modules to preserve pnpm symlinks.
COPY --from=builder --chown=worker:nodejs /app/services/scheduler-worker/dist ./services/scheduler-worker/dist
COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/services/scheduler-worker/node_modules ./services/scheduler-worker/node_modules
COPY --from=builder --chown=worker:nodejs /app/packages/ids/dist ./packages/ids/dist
COPY --from=builder --chown=worker:nodejs /app/packages/ai-core/dist ./packages/ai-core/dist
COPY --from=builder --chown=worker:nodejs /app/packages/scheduler-core/dist ./packages/scheduler-core/dist
COPY --from=builder --chown=worker:nodejs /app/packages/db-schema/dist ./packages/db-schema/dist
COPY --from=builder --chown=worker:nodejs /app/packages/db-client/dist ./packages/db-client/dist
# Copy package.json files for module resolution
COPY --from=builder --chown=worker:nodejs /app/services/scheduler-worker/package.json ./services/scheduler-worker/
COPY --from=builder --chown=worker:nodejs /app/packages/ids/package.json ./packages/ids/
COPY --from=builder --chown=worker:nodejs /app/packages/ai-core/package.json ./packages/ai-core/
COPY --from=builder --chown=worker:nodejs /app/packages/scheduler-core/package.json ./packages/scheduler-core/
COPY --from=builder --chown=worker:nodejs /app/packages/db-schema/package.json ./packages/db-schema/
COPY --from=builder --chown=worker:nodejs /app/packages/db-client/package.json ./packages/db-client/

WORKDIR /app/services/scheduler-worker

ENV NODE_ENV=production

# Build metadata for /version endpoint (from build args)
ARG GIT_SHA=unknown
ARG BUILD_TS=unknown
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_TS=${BUILD_TS}

# NOTE: No HEALTHCHECK instruction — probes defined in K8s manifests or Compose
CMD ["node", "dist/main.js"]
