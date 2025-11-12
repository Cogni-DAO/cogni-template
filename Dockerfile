# SPDX-License-Identifier: PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni DAO

FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN apk add --no-cache curl

ENV LOG_FORMAT=json
LABEL org.opencontainers.image.title="cogni-template"

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=10s --timeout=2s --start-period=15s --retries=3 \
  CMD curl -fsS http://0.0.0.0:3000/api/v1/meta/health || exit 1

CMD ["node", "server.js"]