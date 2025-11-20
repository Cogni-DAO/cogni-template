#!/bin/bash
set -euo pipefail

echo "Initializing app database and user..."

APP_DB_USER="${APP_DB_USER:?APP_DB_USER is required}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:?APP_DB_PASSWORD is required}"
APP_DB_NAME="${APP_DB_NAME:?APP_DB_NAME is required}"

# Create user (can be done in DO block)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_DB_USER') THEN
      CREATE USER $APP_DB_USER WITH PASSWORD '$APP_DB_PASSWORD';
    END IF;
  END
  \$\$;
EOSQL

# Check if database exists (CREATE DATABASE must be outside transactions)
DB_EXISTS=$(psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$APP_DB_NAME';" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB")

if [ -z "$DB_EXISTS" ]; then
  echo "Creating database '$APP_DB_NAME'..."
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE $APP_DB_NAME OWNER $APP_DB_USER;"
else
  echo "Database '$APP_DB_NAME' already exists."
fi

# Grant privileges
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "GRANT ALL PRIVILEGES ON DATABASE $APP_DB_NAME TO $APP_DB_USER;"

echo "App database '$APP_DB_NAME' and user '$APP_DB_USER' initialized."