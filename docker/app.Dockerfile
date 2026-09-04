# syntax = docker/dockerfile:1.25

# ========================================
# Base Debian slim: runtime-only dependencies + pre-compiled isolated-vm
# This layer is cached and reused across builds. isolated-vm is compiled once.
# ========================================
FROM oven/bun:1.3.14-slim AS base-alpine

# Install Node.js 24 (Active LTS), runtime dependencies, and pre-compile isolated-vm
# Node runs only the isolated-vm sandbox worker; Bun runs the app.
# isolated-vm is compiled ONCE here and cached in this layer.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 curl ca-certificates bash ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    # Pre-compile isolated-vm ONCE in this base layer
    && apt-get install -y --no-install-recommends \
    python3-pip python3-venv make g++ \
    && cd /tmp \
    && npm pack isolated-vm@latest \
    && tar -xzf isolated-vm-*.tgz \
    && cd package \
    && npm install --build-from-source \
    && mkdir -p /usr/local/lib/node_modules \
    && cp -r node_modules/isolated-vm /usr/local/lib/node_modules/ \
    && cd / && rm -rf /tmp/* \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ========================================
# Build Base: adds the native toolchain (minimal)
# ========================================
FROM base-alpine AS build-base

# Only additional build tools needed beyond what base-alpine has
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip python3-venv \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ========================================
# Pruner Stage: Emit a minimal monorepo subset that sim depends on
# ========================================
FROM build-base AS pruner
WORKDIR /app

RUN bun install -g turbo@2.9.6

COPY . .

# Read the package name from the app manifest
RUN APP_PACKAGE_NAME="$(bun -e "console.log(require('./apps/sim/package.json').name)")" && \
    turbo prune "$APP_PACKAGE_NAME" --docker

# ========================================
# Dependencies Stage: Install Dependencies (uses pre-compiled isolated-vm from base-alpine)
# ========================================
FROM build-base AS deps
WORKDIR /app

# Pruned manifests from the pruner stage
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/bun.lock ./bun.lock

# Copy workspace packages from pruner stage for hoisted node_modules symlinks
COPY --from=pruner /app/out/full/packages ./packages

# Ensure @sim/deployment-config is available for install (may not be in turbo prune output)
COPY packages/deployment-config ./packages/deployment-config

# Copy pre-compiled isolated-vm from base-alpine layer (no rebuild needed!)
COPY --from=base-alpine /usr/local/lib/node_modules/isolated-vm ./node_modules/isolated-vm

# Install all other dependencies (including devDependencies for build time)
# JOBS=2 caps node-gyp parallelism for any native deps
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    --mount=type=cache,id=npm-cache,target=/root/.npm \
    HUSKY=0 bun install --ignore-scripts --linker=hoisted

# ========================================
# Builder Stage: Build the Application
# ========================================
FROM build-base AS builder
ARG TARGETPLATFORM
WORKDIR /app

# Copy node_modules from deps stage (includes pre-compiled isolated-vm)
COPY --from=deps /app/node_modules ./node_modules

# Copy pruned source tree (apps/sim + workspace packages it depends on)
COPY --from=pruner /app/out/full/ ./

# Lockfile for Next.js/Turbopack workspace detection
COPY --from=pruner /app/bun.lock ./bun.lock

ENV NEXT_TELEMETRY_DISABLED=1 \
    VERCEL_TELEMETRY_DISABLED=1 \
    DOCKER_BUILD=1 \
    CI=true

# Dummy values so next build can evaluate modules. Override at runtime.
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/dummy"
ENV DATABASE_URL=${DATABASE_URL}

ARG NEXT_PUBLIC_APP_URL="http://localhost:3000"
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Dummy auth secret for build-time static generation. Override at runtime.
ARG BETTER_AUTH_SECRET="build-time-dummy-secret-change-in-production"
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}

# Limit Node.js heap size for build stability on 7GB runners (keeps headroom for Rust Turbopack)
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Run build in Docker
RUN --mount=type=cache,id=next-cache-${TARGETPLATFORM},target=/app/apps/sim/.next/cache \
    --mount=type=cache,id=turbo-cache-${TARGETPLATFORM},target=/app/.turbo \
    bun run --cwd apps/sim build

# Bundle the secrets-loading bootstrap into a self-contained entrypoint
RUN bun build apps/sim/bootstrap.ts --target=bun --outfile=apps/sim/bootstrap.js

# ========================================
# Runner Stage: Run the actual app
# ========================================

FROM base-alpine AS runner
WORKDIR /app

# Runtime dependencies already installed in base-alpine
ENV NODE_ENV=production

# Create non-root user and group (Debian uses groupadd/useradd)
RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m -s /bin/bash nextjs

# Copy application artifacts from builder
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/public ./apps/sim/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/.next/static ./apps/sim/.next/static

# Self-contained secrets-loading bootstrap
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/bootstrap.js ./apps/sim/bootstrap.js

# Copy blog/author content for runtime filesystem reads
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/content ./apps/sim/content

# Copy isolated-vm native module (pre-compiled in base-alpine)
COPY --from=base-alpine --chown=nextjs:nodejs /usr/local/lib/node_modules/isolated-vm ./node_modules/isolated-vm

# Copy Yjs stack (hoisted to monorepo root in deps stage)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/lib0 ./node_modules/lib0
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/yjs ./node_modules/yjs
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/y-protocols ./node_modules/y-protocols

# Sharp and @img (dynamic libvips loading)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

# Copy the isolated-vm worker script
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/execution/isolated-vm-worker.cjs ./apps/sim/lib/execution/isolated-vm-worker.cjs

# Copy the pre-built sandbox library bundles
COPY --from=builder --chown=nextjs:nodejs /app/apps/sim/lib/execution/sandbox/bundles ./apps/sim/lib/execution/sandbox/bundles

# Create .next/cache directory with correct ownership
RUN mkdir -p apps/sim/.next/cache && \
    chown -R nextjs:nodejs apps/sim/.next/cache

# Switch to non-root user
USER nextjs

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

CMD ["bun", "apps/sim/bootstrap.js"]