#!/bin/bash
set -euo pipefail

# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Module: platform/infra/services/runtime/postgres-init/provision.sh
# Purpose: Runner script for idempotent DB provisioning.
# Scope: Executed by the db-provision service container.
# Invariants: Waits for Postgres to be healthy, then creates app and litellm databases if missing.
# Side-effects: IO (psql commands).

# Configuration from Env
PG_HOST="${DB_HOST:-postgres}"
PG_PORT="${DB_PORT:-5432}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_PASS="${POSTGRES_PASSWORD:-postgres}"

# Target Databases (defaults)
APP_DB="${APP_DB_NAME:-cogni_template_dev}"
LITELLM_DB="${LITELLM_DB_NAME:-litellm_dev}"

# Helper: Run SQL as Superuser
function run_sql_as_root() {
  local db="$1"
  local sql="$2"
  PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 -c "$sql"
}

echo "⏳ Waiting for Postgres at $PG_HOST:$PG_PORT..."
until PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "postgres" -c '\q' >/dev/null 2>&1; do
  echo "   ... sleeping"
  sleep 2
done
echo "✅ Postgres is up."

echo "🔧 Starting Provisioning (Database Creation Only)..."

# Database Creation (Idempotent)
for db in "$APP_DB" "$LITELLM_DB"; do
  # We construct the CREATE statement safely by validating the db name first is not needed for MVP dev env
  # where inputs are controlled env vars. In production hardening, we would be more rigorous.
  exists=$(run_sql_as_root "postgres" "SELECT 1 FROM pg_database WHERE datname = '$db'" | grep -c 1 || true)
  if [ "$exists" -eq 0 ]; then
    echo "   -> Creating database '$db'..."
    run_sql_as_root "postgres" "CREATE DATABASE $db;"
  else
    echo "   -> Database '$db' exists."
  fi
done

echo "✅ Provisioning Complete."