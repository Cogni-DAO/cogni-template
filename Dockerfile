# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Base image – shared between deps and builder
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# 1) Dependencies (full, including dev) – cached by package.json + pnpm-lock.yaml
FROM base AS deps
RUN apk add --no-cache g++ make python3
COPY package.json pnpm-lock.yaml ./
# Use official node dist to avoid unofficial-builds.nodejs.org flakiness
ENV npm_config_disturl=https://nodejs.org/dist
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm fetch --frozen-lockfile

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --offline

# 2) Build – reuse node_modules from deps
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG APP_ENV=production

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    APP_ENV=${APP_ENV}

# Build-time DB env for NextAuth + Drizzle adapter validation during `pnpm build`.
# No actual DB connection is made at build time; these values satisfy config validation only.
# Runtime containers will override with real credentials.
ENV DATABASE_URL="postgresql://build_user:build_pass@build-host.invalid:5432/build_db" \
    AUTH_SECRET="build-time-secret-min-32-chars-long-placeholder"

# Build workspace packages (TypeScript project references)
# Required: Next.js build imports @cogni/* packages, which must be built first
RUN pnpm exec tsc -b

# Persist Next's build cache across Docker builds (huge win for rebuilds)
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache,sharing=locked \
    pnpm build
    
# 3) Migrator – minimal image for running database migrations via drizzle-kit
FROM base AS migrator
WORKDIR /app

# Copy package manifest files (required for pnpm to work)
COPY package.json pnpm-lock.yaml ./

# Reuse node_modules from deps stage (includes drizzle-kit and all dependencies)
COPY --from=deps /app/node_modules ./node_modules

# Copy only files required by drizzle.config.ts and migrate command
COPY drizzle.config.ts ./
COPY src/shared/db ./src/shared/db
COPY src/adapters/server/db/migrations ./src/adapters/server/db/migrations

# Run canonical migration script (drizzle-kit migrate)
CMD ["pnpm", "db:migrate:container"]

# 4) Runtime – lean production image (no migration tooling)
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
