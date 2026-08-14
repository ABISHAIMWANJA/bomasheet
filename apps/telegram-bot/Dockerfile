# BomaClaw: a standalone Telegram bot, deliberately built and deployed
# independently of the main BomaSheet image. It is excluded from the pnpm
# workspace (see pnpm-workspace.yaml) and has its own npm lockfile, so a
# change here can never break BomaSheet's own build or vice versa.

FROM node:20.9.0-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20.9.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs && \
    mkdir -p /app/data && chown nodejs:nodejs /app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

USER nodejs
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
