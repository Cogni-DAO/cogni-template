# syntax=docker/dockerfile:1.7-labs
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Base image – shared across stages
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# Builder: full workspace install + build
# Cache efficiency relies on BuildKit pnpm-store mount (packages pre-fetched)
FROM base AS builder
RUN apk add --no-cache g++ make python3

# 1. Copy dependency manifests first (maximizes install layer caching)
#    --parents preserves directory structure with wildcards (BuildKit feature)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --parents packages/*/package.json ./

# Use official node dist to avoid unofficial-builds.nodejs.org flakiness
ENV npm_config_disturl=https://nodejs.org/dist

# 2. Install dependencies (cached when manifests unchanged)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

# 3. Copy full source (filtered by .dockerignore)
COPY . .

ARG APP_ENV=production

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    APP_ENV=${APP_ENV}

# Build all workspace packages (brute-force, not graph-scoped)
# Required: package exports point to dist/, must exist before Next.js build
# Uses canonical packages:build: tsup (JS) + tsc -b (declarations) + validation
RUN pnpm packages:build

# Build-time placeholder for AUTH_SECRET (required by env validation during Next.js page collection)
# Not a real secret; runtime containers must provide real AUTH_SECRET via deployment env
ARG AUTH_SECRET_BUILD="build-time-placeholder-min-32-chars-xxxxxxxxxxxxxxxx"
ENV AUTH_SECRET=${AUTH_SECRET_BUILD}

# Build workspace root (Next.js app)
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache,sharing=locked \
    pnpm -w build

# Migrator – minimal image for database migrations via drizzle-kit
FROM base AS migrator
WORKDIR /app

# Copy from builder (includes built workspace packages)
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/src/shared/db ./src/shared/db
COPY --from=builder /app/src/adapters/server/db/migrations ./src/adapters/server/db/migrations

# Run canonical migration script (drizzle-kit migrate)
CMD ["pnpm", "db:migrate:container"]

# Runner – lean production image
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV LOG_FORMAT=json

LABEL org.opencontainers.image.title="cogni-template"

# Copy standalone bundle (includes production dependencies)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=2s --start-period=15s --retries=3 \
CMD curl -fsS http://0.0.0.0:3000/readyz || exit 1

CMD ["node", "server.js"]
