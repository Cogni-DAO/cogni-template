#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

BACKUP_ROOT="${DB_BACKUP_ROOT:-/backups}"
INTERVAL_SECONDS="${DB_BACKUP_INTERVAL_SECONDS:-86400}"
RETENTION_DAYS="${DB_BACKUP_RETENTION_DAYS:-14}"
OBSERVABILITY_GRACE_SECONDS="${DB_BACKUP_OBSERVABILITY_GRACE_SECONDS:-90}"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

log_json() {
  local level="$1" event="$2" cluster="$3" message="$4" path="${5:-}"
  printf '{"level":"%s","event":"%s","cluster":"%s","msg":"%s","path":"%s","time":"%s"}\n' \
    "$(json_escape "$level")" \
    "$(json_escape "$event")" \
    "$(json_escape "$cluster")" \
    "$(json_escape "$message")" \
    "$(json_escape "$path")" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

require_positive_int() {
  local name="$1" value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || [ "$value" -lt 1 ]; then
    log_json error db_backup.config "" "$name must be a positive integer"
    exit 2
  fi
}

require_nonnegative_int() {
  local name="$1" value="$2"
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    log_json error db_backup.config "" "$name must be a non-negative integer"
    exit 2
  fi
}

wait_for_postgres() {
  local cluster="$1" host="$2" port="$3" user="$4"
  local deadline=$((SECONDS + 120))
  until pg_isready -h "$host" -p "$port" -U "$user" >/dev/null 2>&1; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      log_json error db_backup.unreachable "$cluster" "postgres did not become ready before timeout"
      return 1
    fi
    sleep 2
  done
}

safe_name() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9_.-' '_'
}

write_manifest() {
  local dir="$1"
  (
    cd "$dir"
    find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256
  )
}

prune_old_backups() {
  local cluster_dir="$1"
  find "$cluster_dir" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
}

backup_cluster() {
  local cluster="$1" host="$2" port="$3" user="$4" password="$5"
  local timestamp tmp_dir final_dir dbs db db_file

  export PGPASSWORD="$password"

  # FAIL-CLOSED CONTRACT (prod 2026-08-05 incident): run_once invokes this as
  # `backup_cluster … || failed=1`, which DISABLES `set -e` for the entire function
  # (bash neuters errexit for any command that is the left operand of && / ||). So
  # every fallible step below is checked EXPLICITLY and returns non-zero on failure.
  # Without this, a failed dump (e.g. the superuser password drifting so pg_dumpall
  # gets `password authentication failed` and writes a 0-byte globals.sql) falls
  # through to the `db_backup.completed` log — a silent-success that makes the
  # completion event + a Loki hit look like a real backup when nothing was captured.
  # `db_backup.completed` is emitted ONLY after every dump in this cluster succeeded.
  if ! wait_for_postgres "$cluster" "$host" "$port" "$user"; then
    return 1
  fi

  timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  tmp_dir="$BACKUP_ROOT/.${cluster}.${timestamp}.tmp"
  final_dir="$BACKUP_ROOT/${cluster}/${timestamp}"

  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir" "$BACKUP_ROOT/$cluster"

  log_json info db_backup.started "$cluster" "starting postgres backup"

  if ! pg_dumpall -h "$host" -p "$port" -U "$user" --globals-only > "$tmp_dir/globals.sql"; then
    log_json error db_backup.failed "$cluster" "pg_dumpall --globals-only failed (auth/connectivity?)"
    rm -rf "$tmp_dir"
    return 1
  fi

  if ! dbs="$(psql -h "$host" -p "$port" -U "$user" -d postgres -At \
      -c "select datname from pg_database where datallowconn and not datistemplate order by datname")"; then
    log_json error db_backup.failed "$cluster" "enumerating databases failed"
    rm -rf "$tmp_dir"
    return 1
  fi

  while IFS= read -r db; do
    [ -n "$db" ] || continue
    db_file="$(safe_name "$db").dump"
    if ! pg_dump -h "$host" -p "$port" -U "$user" -d "$db" --format=custom --file="$tmp_dir/$db_file"; then
      log_json error db_backup.failed "$cluster" "pg_dump of database '$db' failed"
      rm -rf "$tmp_dir"
      return 1
    fi
  done <<< "$dbs"

  write_manifest "$tmp_dir"
  mv "$tmp_dir" "$final_dir"
  prune_old_backups "$BACKUP_ROOT/$cluster"
  log_json info db_backup.completed "$cluster" "postgres backup completed" "$final_dir"
}

run_once() {
  local failed=0

  backup_cluster app postgres 5432 "${POSTGRES_ROOT_USER:?POSTGRES_ROOT_USER is required}" "${POSTGRES_ROOT_PASSWORD:?POSTGRES_ROOT_PASSWORD is required}" || failed=1
  backup_cluster temporal temporal-postgres 5432 "${TEMPORAL_DB_USER:-temporal}" "${TEMPORAL_DB_PASSWORD:-temporal}" || failed=1

  if [ "$failed" -eq 0 ]; then
    log_json info db_backup.run_completed all "all postgres backups completed"
    return 0
  fi

  log_json error db_backup.run_failed all "one or more postgres backups failed"
  return 1
}

main() {
  require_positive_int DB_BACKUP_INTERVAL_SECONDS "$INTERVAL_SECONDS"
  require_positive_int DB_BACKUP_RETENTION_DAYS "$RETENTION_DAYS"
  require_nonnegative_int DB_BACKUP_OBSERVABILITY_GRACE_SECONDS "$OBSERVABILITY_GRACE_SECONDS"
  mkdir -p "$BACKUP_ROOT"

  case "${1:-once}" in
    once)
      local status=0
      run_once || status=$?
      if [ "$OBSERVABILITY_GRACE_SECONDS" -gt 0 ]; then
        log_json info db_backup.observe_grace all "waiting for log collection before exit"
        sleep "$OBSERVABILITY_GRACE_SECONDS"
      fi
      return "$status"
      ;;
    *)
      echo "Usage: $0 [once]" >&2
      exit 2
      ;;
  esac
}

main "$@"
