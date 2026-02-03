#!/bin/bash
set -euo pipefail

# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

# Module: platform/infra/services/runtime/postgres-init/provision.sh
# Purpose: Idempotent database and role provisioning for runtime stack.
# Scope: Executed by the db-provision service container; creates app role, app database (owned by role), and litellm database (root-owned).
# Invariants: Requires APP_DB_USER and APP_DB_PASSWORD; validates identifier syntax (alphanumeric + underscore); creates role only if missing; sets DB ownership on new databases only.
# Side-effects: IO (psql commands); creates roles and databases in target Postgres instance.

# Configuration from Env
PG_HOST="${DB_HOST:-postgres}"
PG_PORT="${DB_PORT:-5432}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_PASS="${POSTGRES_PASSWORD:-postgres}"

# Target Databases (defaults)
APP_DB="${APP_DB_NAME:-cogni_template_dev}"
LITELLM_DB="${LITELLM_DB_NAME:-litellm_dev}"

# App User Credentials (required, no defaults)
APP_USER="${APP_DB_USER:-}"
APP_PASS="${APP_DB_PASSWORD:-}"

if [ -z "$APP_USER" ] || [ -z "$APP_PASS" ]; then
  echo "❌ ERROR: APP_DB_USER and APP_DB_PASSWORD are required"
  exit 1
fi

# Validate identifiers (strict allowlist: alphanumeric + underscore only)
if ! [[ "$APP_USER" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "❌ ERROR: APP_DB_USER contains invalid characters (allowed: a-zA-Z0-9_)"
  exit 1
fi
if ! [[ "$APP_DB" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "❌ ERROR: APP_DB_NAME contains invalid characters (allowed: a-zA-Z0-9_)"
  exit 1
fi
if ! [[ "$LITELLM_DB" =~ ^[a-zA-Z0-9_]+$ ]]; then
  echo "❌ ERROR: LITELLM_DB_NAME contains invalid characters (allowed: a-zA-Z0-9_)"
  exit 1
fi

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

echo "🔧 Starting Provisioning (Roles and Databases)..."

# App Role Creation (Idempotent)
echo "🔧 Checking app role '$APP_USER'..."
role_exists=$(run_sql_as_root "postgres" "SELECT 1 FROM pg_roles WHERE rolname = '$APP_USER'" | grep -c 1 || true)
if [ "$role_exists" -eq 0 ]; then
  echo "   -> Creating role '$APP_USER'..."
  # Use psql variable for password (:'var' substitutes as properly-quoted literal)
  # Note: psql variables only work with heredoc/stdin, not with -c flag
  PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "postgres" -v ON_ERROR_STOP=1 \
    -v app_pass="$APP_PASS" <<SQL
CREATE ROLE "$APP_USER" WITH LOGIN PASSWORD :'app_pass';
SQL
else
  echo "   -> Role '$APP_USER' already exists."
fi

# App Database Creation (Idempotent, owned by app user)
echo "🔧 Checking app database '$APP_DB'..."
app_db_exists=$(run_sql_as_root "postgres" "SELECT 1 FROM pg_database WHERE datname = '$APP_DB'" | grep -c 1 || true)
if [ "$app_db_exists" -eq 0 ]; then
  echo "   -> Creating database '$APP_DB' with owner '$APP_USER'..."
  run_sql_as_root "postgres" "CREATE DATABASE \"$APP_DB\" OWNER \"$APP_USER\";"
else
  echo "   -> Database '$APP_DB' already exists."
fi

# LiteLLM Database Creation (Idempotent, root-owned for litellm service)
echo "🔧 Checking litellm database '$LITELLM_DB'..."
litellm_db_exists=$(run_sql_as_root "postgres" "SELECT 1 FROM pg_database WHERE datname = '$LITELLM_DB'" | grep -c 1 || true)
if [ "$litellm_db_exists" -eq 0 ]; then
  echo "   -> Creating database '$LITELLM_DB'..."
  run_sql_as_root "postgres" "CREATE DATABASE \"$LITELLM_DB\";"
else
  echo "   -> Database '$LITELLM_DB' already exists."
fi

# ── RLS Role Hardening ──────────────────────────────────────────────────────
# Per DATABASE_RLS_SPEC.md: app_user gets DML-only; app_service gets BYPASSRLS.
# Migrations run as superuser (postgres), never as app_user.

echo "🔧 Applying RLS role hardening on '$APP_DB'..."

# Revoke DDL privileges from app_user on public schema (least privilege)
run_sql_as_root "$APP_DB" "REVOKE CREATE ON SCHEMA public FROM \"$APP_USER\";"

# Grant DML-only on existing tables
run_sql_as_root "$APP_DB" "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"$APP_USER\";"
run_sql_as_root "$APP_DB" "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"$APP_USER\";"

# Ensure future tables inherit the same grants
run_sql_as_root "$APP_DB" "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"$APP_USER\";"
run_sql_as_root "$APP_DB" "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"$APP_USER\";"

# ── Service Role (scheduler, internal workers) ─────────────────────────────
# Same DML grants but with BYPASSRLS for cross-tenant operations.
APP_SERVICE_ROLE="${APP_USER}_service"
echo "🔧 Checking service role '$APP_SERVICE_ROLE'..."
service_role_exists=$(run_sql_as_root "postgres" "SELECT 1 FROM pg_roles WHERE rolname = '$APP_SERVICE_ROLE'" | grep -c 1 || true)
if [ "$service_role_exists" -eq 0 ]; then
  echo "   -> Creating service role '$APP_SERVICE_ROLE' with BYPASSRLS..."
  PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "postgres" -v ON_ERROR_STOP=1 \
    -v app_pass="$APP_PASS" <<SQL
CREATE ROLE "$APP_SERVICE_ROLE" WITH LOGIN PASSWORD :'app_pass' BYPASSRLS;
SQL
else
  echo "   -> Service role '$APP_SERVICE_ROLE' already exists."
fi

# Grant DML to service role on app DB
run_sql_as_root "$APP_DB" "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"$APP_SERVICE_ROLE\";"
run_sql_as_root "$APP_DB" "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"$APP_SERVICE_ROLE\";"
run_sql_as_root "$APP_DB" "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO \"$APP_SERVICE_ROLE\";"
run_sql_as_root "$APP_DB" "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO \"$APP_SERVICE_ROLE\";"

echo "✅ Provisioning Complete."