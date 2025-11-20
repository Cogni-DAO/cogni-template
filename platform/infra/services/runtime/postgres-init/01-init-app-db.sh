#!/bin/bash
set -euo pipefail

echo "Initializing app database and user..."

APP_DB_USER="${APP_DB_USER:?APP_DB_USER is required}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
APP_DB_NAME="${APP_DB_NAME:?APP_DB_NAME is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_DB_USER') THEN
      CREATE USER $APP_DB_USER WITH PASSWORD '$APP_DB_PASSWORD';
    END IF;
  END
  \$\$;

  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '$APP_DB_NAME') THEN
      CREATE DATABASE $APP_DB_NAME OWNER $APP_DB_USER;
    END IF;
  END
  \$\$;

  GRANT ALL PRIVILEGES ON DATABASE $APP_DB_NAME TO $APP_DB_USER;
EOSQL

echo "App database '$APP_DB_NAME' and user '$APP_DB_USER' initialized."