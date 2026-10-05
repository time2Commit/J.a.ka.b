# syntax=docker/dockerfile:1
#
# One file, four targets (see docker-compose.yml):
#   web      Next.js standalone server (also holds pg_dump for the nightly backup)
#   collab   Hocuspocus server for real-time notes
#   migrate  one-shot job that applies the database migrations
# Build from the repository root:  docker build -f docker/Dockerfile --target web .

ARG NODE_VERSION=22

# --- base: Node and pnpm (the version comes from package.json's "packageManager")
FROM node:${NODE_VERSION}-alpine AS base
# openssl: Prisma needs it to pick the right engine for Alpine
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
# No git hooks in an image; pnpm should never prompt
ENV HUSKY=0 CI=true NEXT_TELEMETRY_DISABLED=1

# --- deps: every workspace dependency, cached until a manifest or the lockfile changes
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/collab/package.json apps/collab/
COPY packages/db/package.json packages/db/
COPY packages/editor/package.json packages/editor/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# --- build: Prisma client, then the Next.js standalone output
FROM deps AS build
COPY . .
RUN pnpm --filter @jakab/db generate
RUN pnpm --filter @jakab/web build

# --- web
FROM node:${NODE_VERSION}-alpine AS web
# pg_dump for the scheduled database backup (a newer client can dump an older server)
RUN apk add --no-cache postgresql-client
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads BACKUP_DIR=/data/backups
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# Mount points: a named volume copies this ownership on first use
RUN mkdir -p /data/uploads /data/backups && chown -R node:node /data
USER node
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -q --spider http://127.0.0.1:3000/login || exit 1
CMD ["node", "server.js"]

# --- collab
FROM deps AS collab
# tsconfig.base.json: the packages extend it (Prisma's generator reads it too)
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/collab ./apps/collab
RUN pnpm --filter @jakab/db generate
ENV NODE_ENV=production COLLAB_PORT=1234
USER node
WORKDIR /app/apps/collab
EXPOSE 1234
# tsx runs the TypeScript sources of the workspace packages directly
CMD ["./node_modules/.bin/tsx", "src/main.ts"]

# --- migrate
FROM deps AS migrate
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
# Fetch the schema engine for this platform now, so running the job needs no internet
RUN node /app/node_modules/.pnpm/@prisma+engines@*/node_modules/@prisma/engines/scripts/postinstall.js
WORKDIR /app/packages/db
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]
