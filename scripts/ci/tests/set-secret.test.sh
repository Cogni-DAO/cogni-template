#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO
#
# Fixture-driven regression tests for scripts/secrets/set-secret.sh (task.0284).
# Uses $SET_SECRET_BAO as a test shim — a stub script that records (path,
# key, value-from-stdin) into a fixture file. No real bao, no real SSH.
#
# Run: bash scripts/ci/tests/set-secret.test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TARGET="$REPO_ROOT/scripts/secrets/set-secret.sh"

TMPROOT=$(mktemp -d -t set-secret.XXXXXX)
trap 'rm -rf "$TMPROOT"' EXIT

LOG="$TMPROOT/calls.log"

# Test shim: writes "<path>|<key>|<value>" to $LOG.
cat >"$TMPROOT/bao-shim.sh" <<'SHIM'
#!/usr/bin/env bash
set -euo pipefail
path="$1"; key="$2"
value=$(cat)
printf '%s|%s|%s\n' "$path" "$key" "$value" >>"${SHIM_LOG}"
SHIM
chmod +x "$TMPROOT/bao-shim.sh"

pass=0
fail=0

run_case() {
  # $1 case name; $2 stdin value (empty string for no input); $3 expected exit;
  # $4 expected SHIM_LOG content (empty means no shim invocation expected);
  # $@ from $5 onward: args to set-secret.sh.
  local name="$1" stdin="$2" expected_exit="$3" expected_log="$4"
  shift 4
  : >"$LOG"
  local got=0 out
  if [[ -n "$stdin" ]]; then
    out=$(printf '%s' "$stdin" | SHIM_LOG="$LOG" SET_SECRET_BAO="$TMPROOT/bao-shim.sh" REPO_ROOT="$REPO_ROOT" bash "$TARGET" "$@" 2>&1) || got=$?
  else
    out=$(SHIM_LOG="$LOG" SET_SECRET_BAO="$TMPROOT/bao-shim.sh" REPO_ROOT="$REPO_ROOT" bash "$TARGET" "$@" </dev/null 2>&1) || got=$?
  fi
  local logged
  logged=$(cat "$LOG" 2>/dev/null || true)
  if [[ "$got" -eq "$expected_exit" && "$logged" == "$expected_log" ]]; then
    printf 'OK  %s\n' "$name"
    pass=$((pass + 1))
  else
    printf 'FAIL %s — exit got=%d want=%d; log got=%q want=%q\n' \
      "$name" "$got" "$expected_exit" "$logged" "$expected_log"
    printf '  output:\n'
    # shellcheck disable=SC2001
    sed 's/^/    /' <<<"$out"
    fail=$((fail + 1))
  fi
}

# Case 1 — happy path: valid env + catalog service + key + value via stdin.
run_case "happy path writes through to bao" "hunter2" 0 \
  "cogni/candidate-a/node-template|OPENROUTER_API_KEY|hunter2" \
  candidate-a node-template OPENROUTER_API_KEY

# Case 2 — preview env accepted. (SCHEDULER_API_TOKEN, not GH_WEBHOOK_SECRET:
# the worker holds no GitHub credential — bug.5000/bug.5012.)
run_case "preview env accepted" "v" 0 \
  "cogni/preview/scheduler-worker|SCHEDULER_API_TOKEN|v" \
  preview scheduler-worker SCHEDULER_API_TOKEN

# Case 3 — _shared namespace accepted.
run_case "_shared namespace accepted" "shared-val" 0 \
  "cogni/candidate-a/_shared|OPENROUTER_API_KEY|shared-val" \
  candidate-a _shared OPENROUTER_API_KEY

# Case 4 — _system namespace rejected (Spec Invariant 10).
run_case "_system rejected" "x" 2 "" \
  candidate-a _system SOME_KEY

# Case 5 — other reserved _foo namespace rejected.
run_case "_unknown reserved namespace rejected" "x" 2 "" \
  candidate-a _operator FOO

# Case 6 — unknown env rejected.
run_case "unknown env rejected" "x" 2 "" \
  staging node-template FOO

# Case 7 — unknown service (no catalog file) rejected.
run_case "unknown service rejected" "x" 2 "" \
  candidate-a not-a-real-service FOO

# Case 8 — lowercase key rejected.
run_case "lowercase key rejected" "x" 2 "" \
  candidate-a node-template lowercase_key

# Case 9 — key starting with digit rejected.
run_case "digit-leading key rejected" "x" 2 "" \
  candidate-a node-template 1_BAD_KEY

# Case 10 — key with hyphen rejected.
run_case "hyphenated key rejected" "x" 2 "" \
  candidate-a node-template BAD-KEY

# Case 11 — empty stdin value rejected.
run_case "empty value rejected" "" 2 "" \
  candidate-a node-template GOOD_KEY

# Case 12 — wrong arg count rejected.
run_case "missing service arg rejected" "x" 2 "" \
  candidate-a node-template

echo
echo "set-secret.test.sh — pass: $pass, fail: $fail"
if [[ $fail -gt 0 ]]; then
  exit 1
fi
