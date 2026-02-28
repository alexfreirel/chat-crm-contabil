#!/bin/sh
set -e

# Auto-migrar o banco na API (apenas no container da API, nao no worker)
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "[entrypoint] Aplicando schema do banco (prisma db push)..."
  cd /app/packages/shared
  npx prisma db push --skip-generate --accept-data-loss 2>&1 || echo "[entrypoint] AVISO: prisma db push falhou, banco pode nao estar pronto ainda"
  cd /app/apps/${APP}
fi

exec node dist/main.js
