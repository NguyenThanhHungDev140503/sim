# syntax = docker/dockerfile:1.25

# ========================================
# Base Debian slim: runtime dependencies + pre-compiled isolated-vm
# ========================================
FROM oven/bun:1.3.14-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 curl ca-certificates bash ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && apt-get install -y --no-install-recommends python3-pip python3-venv make g++ \
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
# Runner Stage: Run pre-built Next.js application
# ========================================
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m -s /bin/bash nextjs

# Copy pre-built application artifacts from host workspace
COPY --chown=nextjs:nodejs apps/sim/public ./apps/sim/public
COPY --chown=nextjs:nodejs apps/sim/.next/standalone ./
COPY --chown=nextjs:nodejs apps/sim/.next/static ./apps/sim/.next/static
COPY --chown=nextjs:nodejs apps/sim/bootstrap.js ./apps/sim/bootstrap.js
COPY --chown=nextjs:nodejs apps/sim/content ./apps/sim/content

# Copy pre-compiled isolated-vm native module
COPY --from=base --chown=nextjs:nodejs /usr/local/lib/node_modules/isolated-vm ./node_modules/isolated-vm

# Copy hoisted runtime packages from host node_modules
COPY --chown=nextjs:nodejs node_modules/lib0 ./node_modules/lib0
COPY --chown=nextjs:nodejs node_modules/yjs ./node_modules/yjs
COPY --chown=nextjs:nodejs node_modules/y-protocols ./node_modules/y-protocols
COPY --chown=nextjs:nodejs node_modules/sharp ./node_modules/sharp
COPY --chown=nextjs:nodejs node_modules/@img ./node_modules/@img

# Copy worker and sandbox bundles
COPY --chown=nextjs:nodejs apps/sim/lib/execution/isolated-vm-worker.cjs ./apps/sim/lib/execution/isolated-vm-worker.cjs
COPY --chown=nextjs:nodejs apps/sim/lib/execution/sandbox/bundles ./apps/sim/lib/execution/sandbox/bundles

RUN mkdir -p apps/sim/.next/cache && \
    chown -R nextjs:nodejs apps/sim/.next/cache

USER nextjs

EXPOSE 3000
ENV PORT=3000 \
    HOSTNAME="0.0.0.0"

CMD ["bun", "apps/sim/bootstrap.js"]
