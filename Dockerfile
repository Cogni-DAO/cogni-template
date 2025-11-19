# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Base image – shared between deps and builder
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

# 1) Dependencies (full, including dev) – cached by package.json + pnpm-lock.yaml
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 2) Build – reuse node_modules from deps
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env defaults – NOT secrets
ARG DATABASE_URL=sqlite://build.db
ARG LITELLM_MASTER_KEY=build-key
ARG APP_ENV=production

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    DATABASE_URL=$DATABASE_URL \
    LITELLM_MASTER_KEY=$LITELLM_MASTER_KEY \
    APP_ENV=$APP_ENV

RUN pnpm build

# 3) Runtime – includes app and migration capabilities
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache curl

# Enable pnpm for migrations
RUN corepack enable && corepack prepare pnpm@9.12.2 --activate

# Ensure PATH includes /usr/local/bin for pnpm shims
ENV PATH="/usr/local/bin:${PATH}"
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV LOG_FORMAT=json

LABEL org.opencontainers.image.title="cogni-template"

# Copy runtime bundle AND migration tools
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/src/adapters/server/db/migrations ./src/adapters/server/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Sanity check that pnpm works for migrations
RUN pnpm --version

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=2s --start-period=15s --retries=3 \
  CMD curl -fsS http://0.0.0.0:3000/api/v1/meta/health || exit 1

CMD ["node", "server.js"]