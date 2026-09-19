#!/bin/sh
# Konteyner girişi. Gizli dosyalar depoda yoktur; ortam değişkeninden yazılır.
#
#   DEPLOY_SECRETS_ENV  -> deployments/.secrets.env  (ajan betikleri okur; içerik: KEY=VALUE satırları)
#   RELAYER_SECRET      -> agents/.relayer.env       (ajanın ücret ödeyen G-hesabı; verilmezse ajan
#                                                    testnet'te kendisi üretip friendbot'tan fonlar)
# Sonra bekleyen Prisma göçleri uygulanır ve backend başlar.
set -e

if [ -n "$DEPLOY_SECRETS_ENV" ]; then
  printf '%s\n' "$DEPLOY_SECRETS_ENV" > /app/deployments/.secrets.env
  chmod 600 /app/deployments/.secrets.env
fi
if [ -n "$RELAYER_SECRET" ]; then
  printf 'RELAYER_SECRET=%s\n' "$RELAYER_SECRET" > /app/agents/.relayer.env
  chmod 600 /app/agents/.relayer.env
fi

npx prisma migrate deploy
exec "$@"
