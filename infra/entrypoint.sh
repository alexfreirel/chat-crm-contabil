#!/bin/sh
set -e

# Auto-migrar o banco na API (apenas no container da API, nao no worker)
if [ "$RUN_MIGRATIONS" = "true" ]; then
  cd /app/packages/shared

  # Pre-check: aborta deploy se Instance.tenant_id contiver NULL.
  # O backfill deve ser feito ANTES via migrate-tenant-null.ts; sem isso o
  # db push --accept-data-loss descarta rows ao aplicar o NOT NULL.
  # Stdout = COUNT (string) | vazio = primeiro deploy ou erro (não bloqueia).
  echo "[entrypoint] Pre-check: Instance.tenant_id NOT NULL..."
  NULL_COUNT=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe('SELECT COUNT(*)::int AS c FROM \"Instance\" WHERE tenant_id IS NULL').then(r=>{process.stdout.write(String(r[0].c));process.exit(0)}).catch(()=>process.exit(2)).finally(()=>p.\$disconnect())" 2>/dev/null || true)
  if [ -z "$NULL_COUNT" ]; then
    echo "[entrypoint] Pre-check inconclusivo (tabela Instance pode não existir ainda — primeiro deploy). Prosseguindo."
  elif [ "$NULL_COUNT" != "0" ]; then
    echo "[entrypoint] ABORT: Instance.tenant_id contém $NULL_COUNT row(s) com NULL. Rode migrate-tenant-null.ts antes do deploy."
    exit 1
  else
    echo "[entrypoint] Pre-check OK (0 NULL)."
  fi

  echo "[entrypoint] Aplicando schema do banco (prisma db push)..."

  # Tenta ate 15 vezes com intervalo de 3s
  # Isso aguarda o postgres ficar disponivel sem precisar de nc/netcat
  ATTEMPT=0
  while [ $ATTEMPT -lt 15 ]; do
    if npx prisma db push --skip-generate --accept-data-loss 2>&1; then
      echo "[entrypoint] Schema aplicado com sucesso."
      break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "[entrypoint] prisma db push falhou (tentativa $ATTEMPT/15). Aguardando 3s..."
    sleep 3
  done

  echo "[entrypoint] Executando seed (criando admin se necessário)..."
  npx prisma db seed 2>&1 || echo "[entrypoint] Seed falhou ou foi ignorado — continuando."

  cd /app/apps/${APP}
fi

exec node dist/main.js
