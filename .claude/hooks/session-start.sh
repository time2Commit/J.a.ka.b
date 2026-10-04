#!/bin/bash
# Hook SessionStart per le sessioni cloud di Claude Code:
# installa le dipendenze del monorepo e avvia PostgreSQL locale,
# così lint, typecheck e test (anche di integrazione) funzionano subito.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --- Dipendenze JavaScript (pnpm workspace) ---
corepack enable >/dev/null 2>&1 || true
pnpm install --prefer-offline

# --- PostgreSQL 16 locale (sostituisce il container Docker in sviluppo) ---
DB_NAME="jakab"
DB_USER="jakab"
DB_PASSWORD="jakab"

if command -v pg_ctlcluster >/dev/null 2>&1; then
  if ! pg_lsclusters --no-header 2>/dev/null | grep -q "online"; then
    pg_ctlcluster 16 main start
  fi

  # Utente, database ed estensione pg_trgm (idempotente)
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1 \
    || su postgres -c "psql -c \"CREATE ROLE ${DB_USER} LOGIN SUPERUSER PASSWORD '${DB_PASSWORD}'\""
  su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 \
    || su postgres -c "createdb -O ${DB_USER} ${DB_NAME}"
  su postgres -c "psql -d ${DB_NAME} -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm'" >/dev/null

  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export DATABASE_URL=\"postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}\"" >> "$CLAUDE_ENV_FILE"
  fi
else
  echo "PostgreSQL non disponibile: salto l'avvio del database." >&2
fi
