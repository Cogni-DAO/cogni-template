#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

##
# Script: platform/ci/scripts/loki_push.sh
# Purpose: Push CI job logs to Grafana Cloud Loki with env=ci label for centralized observability.
# Scope: Best-effort telemetry push; never fails CI builds (exits 0 on all paths).
# Inputs:
#   LOKI_URL - Loki push endpoint (e.g., https://logs-prod-us-central1.grafana.net)
#   LOKI_USER - Basic auth username (numeric Grafana Cloud user ID)
#   LOKI_TOKEN - Basic auth API key (secret)
#   LOG_FILE - Path to log file (NDJSON: JSON summary + optional FAILCTX lines)
#   JOB_NAME - Job name for Loki stream label
#   LABELS - Space-delimited logfmt labels (e.g., "workflow=CI job=test ref=main")
# Outputs: Logs pushed to Loki with hardcoded env=ci label; HTTP status to stdout.
# Invariants:
#   - env=ci label locked (prevents accidental production labeling from CI)
#   - sha8 label truncated to 8 chars for cardinality control
#   - URL normalized (trailing slash and path stripped before appending)
#   - LABELS validated (rejects quotes/invalid format; silently uses locked labels only)
#   - Content single-encoded (--arg, not --argjson; jq handles escaping)
#   - Temp files unique per run (mktemp with trap cleanup)
#   - Never prints credentials
# Side-effects: HTTP POST to LOKI_URL; creates/deletes temp file; reads LOG_FILE.
# Exit: Always 0 (best-effort; skips push on missing inputs/files).
# Notes: Called by .github/actions/loki-push composite action. Response body capped at 2000 chars.
##

set -euo pipefail

# Env vars required: LOKI_URL, LOKI_USER, LOKI_TOKEN, LOG_FILE, JOB_NAME, LABELS

# N3: Check jq dependency (implicit on ubuntu-latest but not guaranteed)
if ! command -v jq >/dev/null; then
  echo "⚠️  Loki push skipped: jq not found"
  exit 0
fi

# Validate required env vars
if [[ -z "${LOKI_URL:-}" ]] || [[ -z "${LOKI_USER:-}" ]] || [[ -z "${LOKI_TOKEN:-}" ]]; then
  echo "⚠️  Loki push skipped: missing credentials (LOKI_URL, LOKI_USER, or LOKI_TOKEN)"
  exit 0
fi

# Normalize URL: strip trailing slash and path if present, then build canonical push URL
LOKI_URL="${LOKI_URL%/}"
LOKI_URL="${LOKI_URL%/loki/api/v1/push}"
PUSH_URL="${LOKI_URL}/loki/api/v1/push"

if [[ -z "${LOG_FILE:-}" ]] || [[ ! -s "${LOG_FILE}" ]]; then
  echo "⚠️  Loki push skipped: LOG_FILE not found or empty"
  exit 0
fi

if [[ -z "${JOB_NAME:-}" ]]; then
  echo "⚠️  Loki push skipped: JOB_NAME not set"
  exit 0
fi

# Create temporary file for curl response (prevents parallel run collisions)
RESPONSE_FILE=$(mktemp -t loki-push.XXXXXX)
trap "rm -f '$RESPONSE_FILE'" EXIT

# Read log file (will be JSON-encoded by jq later)
LOG_CONTENT=$(cat "${LOG_FILE}")

# Parse logfmt labels into JSON map
# Input: "workflow=CI job=test ref=main sha8=abc123..."
# Output: {"workflow":"CI","job":"test","ref":"main","sha8":"abc123"}
parse_logfmt_labels() {
  local labels="$1"
  local json="{"
  local first=true

  # Split on spaces, parse k=v pairs
  while IFS= read -r pair; do
    if [[ "$pair" =~ ^([^=]+)=(.+)$ ]]; then
      local key="${BASH_REMATCH[1]}"
      local value="${BASH_REMATCH[2]}"

      # Sanitize key (Loki requires [a-zA-Z0-9_])
      key=$(printf '%s' "$key" | tr -c '[:alnum:]_' '_')

      # Truncate sha8 to 8 chars (label cardinality control)
      if [[ "$key" == "sha8" ]] && [[ ${#value} -gt 8 ]]; then
        value="${value:0:8}"
      fi

      if [[ "$first" = true ]]; then
        first=false
      else
        json+=","
      fi

      # Escape value for JSON (printf avoids trailing newline)
      value=$(printf '%s' "$value" | jq -Rs .)
      json+="\"$key\":$value"
    fi
  done <<< "$(echo "$labels" | tr ' ' '\n')"

  json+="}"
  echo "$json"
}

# N1: Validate LABELS format (Phase 1: space-delimited tokens; spaces in values not supported)
# Tokenize and validate each k=v pair; allow slashes in values (e.g., ref=123/merge)
CUSTOM_LABELS="{}"
if [[ -n "${LABELS:-}" ]]; then
  invalid=0
  for pair in $LABELS; do
    # Must match key=value format (key is alphanumeric/underscore, value is non-empty)
    if [[ ! "$pair" =~ ^[A-Za-z0-9_]+=.+$ ]]; then
      invalid=1
      break
    fi
    # Reject quotes in values (security: prevent injection)
    if [[ "$pair" == *\"* || "$pair" == *\'* ]]; then
      invalid=1
      break
    fi
  done
  if [[ "$invalid" -eq 1 ]]; then
    echo "⚠️  LABELS contains invalid format; using locked labels only"
  else
    CUSTOM_LABELS=$(parse_logfmt_labels "${LABELS}")
  fi
fi

# Merge with hardcoded labels (app, env, job)
# Locked labels: app, env, job - explicitly deleted from custom to prevent override
# env=ci is locked to prevent accidental production labeling from CI
STREAM_LABELS=$(jq -n \
  --argjson custom "$CUSTOM_LABELS" \
  --arg app "cogni-template" \
  --arg env "ci" \
  --arg job "$JOB_NAME" \
  '($custom | del(.env, .app, .job)) + {app: $app, env: $env, job: $job}')

# Get timestamp in nanoseconds
TIMESTAMP_NS=$(date +%s%N)

# Construct Loki JSON payload
# Note: --arg treats values as strings; jq handles JSON encoding
# timestamp: string (per Loki API spec)
# content: string (raw log content, jq will escape newlines/quotes)
PAYLOAD=$(jq -n \
  --argjson labels "$STREAM_LABELS" \
  --arg timestamp "$TIMESTAMP_NS" \
  --arg content "$LOG_CONTENT" \
  '{
    streams: [
      {
        stream: $labels,
        values: [
          [$timestamp, $content]
        ]
      }
    ]
  }')

# Push to Loki with basic auth
HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$RESPONSE_FILE" \
  -X POST \
  -u "${LOKI_USER}:${LOKI_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary "$PAYLOAD" \
  "${PUSH_URL}" || echo "000")

if [[ "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
  echo "✅ Pushed logs to Loki (HTTP $HTTP_CODE)"
else
  echo "⚠️  Loki push failed (HTTP $HTTP_CODE)"
  # Print response body without credentials (capped to 2000 chars)
  head -c 2000 "$RESPONSE_FILE" 2>/dev/null || true
fi

# Always exit 0 (best-effort) - trap handles cleanup
exit 0
