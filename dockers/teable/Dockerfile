ARG NODE_VERSION=20.9.0
ARG BUILD_VERSION="1.0.0-alpha"

###################################################################
# Stage 1: Install all workspaces (dev)dependencies               #
#          and generates node_modules folder(s)                   #
###################################################################

FROM node:${NODE_VERSION}-bookworm AS deps
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# This RUN executes before package.json is copied in, so corepack has no
# "packageManager" field to pin from here and would otherwise fetch whatever
# is newest on npm. A pnpm release built for a newer corepack/Node than this
# base image ships (its CJS shim uses a dynamic import() the vm context here
# can't satisfy) breaks with ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING. Pin to
# the version this repo's package.json and pnpm-lock.yaml already declare.
RUN corepack enable && corepack prepare pnpm@8.15.5 --activate && pnpm add npm-run-all2 zx -g

# Disabling some well-known postinstall scripts
ENV HUSKY=0

WORKDIR /workspace-install

COPY --link package.json pnpm-workspace.yaml pnpm-lock.yaml ./

RUN pnpm fetch

COPY --link . .

RUN pnpm install --prefer-offline --frozen-lockfile
RUN pnpm -F @teable/db-main-prisma prisma-generate --schema ./prisma/postgres/schema.prisma

###################################################################
# Stage 2: Build the app                                          #
###################################################################

FROM deps AS builder

ARG INTEGRATION_TEST
ARG BUILD_VERSION
ARG ENABLE_CSP=true
ARG SENTRY_ENABLED=true
ARG SENTRY_TRACING=true

ENV NODE_ENV=production \
    NEXT_BUILD_ENV_CSP=${ENABLE_CSP} \
    NEXT_BUILD_ENV_TYPECHECK=false \
    NEXT_BUILD_ENV_LINT=false \
    NEXT_BUILD_ENV_SENTRY_ENABLED=${SENTRY_ENABLED} \
    NEXT_BUILD_ENV_SENTRY_TRACING=${SENTRY_TRACING}

WORKDIR /app

COPY --from=deps --link /workspace-install ./

RUN set -eux; \
    echo "NEXT_PUBLIC_BUILD_VERSION=\"${BUILD_VERSION}\"" >> apps/nextjs-app/.env

# Distinguish whether it is an integration test operation
#
# NODE_HEAP_MB caps V8's old-space. Upstream hardcodes 8192, which tells V8 it
# may grow to 8GB: on a host with less free RAM than that, V8 keeps allocating
# instead of collecting, and the kernel OOM-kills something rather than the
# build simply running slower. On this VPS that took out the Dokploy container
# itself mid-build, and Dokploy's startup sweep (initCancelDeployments) then
# marked the still-"running" deployment as "cancelled" -- which reads like a
# build failure but is really the host running out of memory.
#
# Keep this comfortably under the host's free RAM. Raise it only if the build
# actually reports a JavaScript heap out-of-memory error.
#
# 2048 suits a small VPS: the box this was debugged on has 7.8GB total but only
# ~2.3GB actually available (Dokploy plus several other stacks hold the rest)
# and no swap, so even 4096 would overcommit. With swap configured, or on a
# host with real headroom, raising this speeds the build up.
ARG NODE_HEAP_MB=2048
RUN if [ -n "$INTEGRATION_TEST" ]; then \
        pnpm -F "./packages/**" run build; \
    else \
        NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB} pnpm g:build; \
    fi


##################################################################
# Stage 3: Post Builder                                          #
##################################################################

FROM builder as post-builder

ENV NODE_ENV=production

WORKDIR /app

RUN rm -fr node_modules && pnpm nuke:node_modules && \
      chmod +x ./scripts/post-build-cleanup.mjs && zx ./scripts/post-build-cleanup.mjs

RUN pnpm install --prod --prefer-offline --frozen-lockfile
RUN pnpm -F @teable/db-main-prisma prisma-generate --schema ./prisma/postgres/schema.prisma


##################################################################
# Stage 4: Extract a minimal image from the build                #
##################################################################

FROM node:${NODE_VERSION}-bookworm-slim AS runner

ENV TZ=UTC \
    NODE_ENV=production \
    PORT=${NEXTJS_APP_PORT:-3000}

RUN npm install zx -g && \
      apt-get update && apt-get install -y curl openssl && \
      rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Set the correct permission for local cache
RUN mkdir .assets && chown nodejs:nodejs .assets && \
    mkdir .temporary && chown nodejs:nodejs .temporary

USER nodejs

COPY --from=post-builder --chown=nodejs:nodejs /app/apps/nextjs-app/next.config.js \
                    /app/apps/nextjs-app/next-i18next.config.js \
                    /app/apps/nextjs-app/package.json \
                    /app/apps/nextjs-app/.env \
                    ./apps/nextjs-app/

COPY --from=post-builder --chown=nodejs:nodejs /app/apps/nextjs-app/.next ./apps/nextjs-app/.next
COPY --from=post-builder --chown=nodejs:nodejs /app/apps/nextjs-app/node_modules ./apps/nextjs-app/node_modules
COPY --from=post-builder --chown=nodejs:nodejs /app/apps/nextjs-app/public ./apps/nextjs-app/public

COPY --from=post-builder --chown=nodejs:nodejs /app/apps/nestjs-backend/dist ./apps/nestjs-backend/dist
COPY --from=post-builder --chown=nodejs:nodejs /app/apps/nestjs-backend/node_modules ./apps/nestjs-backend/node_modules
COPY --from=post-builder --chown=nodejs:nodejs /app/apps/nestjs-backend/package.json ./apps/nestjs-backend/

COPY --from=builder --chown=nodejs:nodejs /app/packages/common-i18n/ ./packages/common-i18n/

COPY --from=post-builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=post-builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=post-builder --chown=nodejs:nodejs /app/package.json ./package.json

COPY --chown=nodejs:nodejs scripts/start.mjs ./scripts/start.mjs

EXPOSE ${PORT}

CMD ["scripts/start.mjs"]
