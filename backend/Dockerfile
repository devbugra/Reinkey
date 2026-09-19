# Reinkey facilitator (backend). DERLEME BAĞLAMI DEPO KÖKÜDÜR:
#
#   docker build -f backend/Dockerfile -t reinkey-backend .
#
# İmaj yalnızca backend'i değil, pnpm workspace'ini de (packages/, agents/) içerir:
# demo kontrolleri ajanı `agents/node_modules/.bin/tsx` ile başlatır ve ajan
# `packages/sdk`'yı kaynaktan kullanır (BACKEND.md / controls.module.ts).
FROM node:24-slim

# Prisma'nın motoru openssl ister; corepack pnpm'i getirir.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable

WORKDIR /app

# 1) pnpm workspace: packages + agents (ajanın tsx'i buradan gelir)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY agents ./agents
RUN pnpm install --frozen-lockfile

# 2) backend: npm ile (kendi lock dosyası var)
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
RUN cd backend && npx prisma generate && npm run build

# 3) açık deploy kimlikleri (gizli olanlar çalışma anında gelir; bkz. docker-entrypoint.sh)
COPY deployments/testnet.json ./deployments/testnet.json

ENV NODE_ENV=production \
    PORT=3000 \
    AGENTS_DIR=/app/agents \
    DEPLOYMENT_FILE=/app/deployments/testnet.json

WORKDIR /app/backend
EXPOSE 3000
ENTRYPOINT ["/app/backend/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
