#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2025 Cogni-DAO

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CI_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${CI_DIR}/../.." && pwd)"
HELPER="${CI_DIR}/lib/github-clone.sh"
# shellcheck source=scripts/ci/lib/github-clone.sh
. "$HELPER"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$WORKDIR/bin"
cat > "$WORKDIR/bin/git" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
{
  if [ -n "${GH_TOKEN:-}" ]; then
    printf 'auth=present '
  else
    printf 'auth=absent '
  fi
  printf 'git'
  printf ' <%s>' "$@"
  printf '\n'
} >> "$GIT_TRACE_FILE"

if [ "${1:-}" = "clone" ]; then
  mkdir -p "${3}/.git"
elif [ "${1:-}" = "-C" ] && [ "${3:-}" = "config" ]; then
  :
elif [ "${1:-}" = "init" ]; then
  mkdir -p "${3}/.git"
fi
SH
chmod +x "$WORKDIR/bin/git"

run_helper() {
  local token="$1"
  local function_call="$2"
  local case_name="$3"
  local trace_file="$WORKDIR/${case_name}.trace"
  local output_file="$WORKDIR/${case_name}.out"

  PATH="$WORKDIR/bin:$PATH" \
    GIT_TRACE_FILE="$trace_file" \
    GH_TOKEN="$token" \
    HELPER="$HELPER" \
    FUNCTION_CALL="$function_call" \
    bash -x -c '. "$HELPER"; eval "$FUNCTION_CALL"' \
      > "$output_file" 2>&1

  if [ -n "$token" ] && grep -Fq "$token" "$trace_file" "$output_file"; then
    echo "raw token leaked in ${case_name}" >&2
    exit 1
  fi
}

PUBLIC_SHA=0123456789012345678901234567890123456789

# The remote-node path must fetch public source without a read token.
FUNCTION_CALL="github_materialize_commit https://github.com/cogni-test-org/public-node.git ${PUBLIC_SHA} $WORKDIR/public-node"
run_helper "" "$FUNCTION_CALL" remote-public
grep -Fq 'auth=absent git <-C>' "$WORKDIR/remote-public.trace"
grep -Fq '<remote> <add> <origin> <https://github.com/cogni-test-org/public-node.git>' \
  "$WORKDIR/remote-public.trace"
grep -Fq "<fetch> <-q> <--depth> <1> <origin> <${PUBLIC_SHA}>" \
  "$WORKDIR/remote-public.trace"

SECRET='token-that-must-never-print'
FUNCTION_CALL="github_materialize_commit cogni-test-org/private-node ${PUBLIC_SHA} $WORKDIR/private-node"
run_helper "$SECRET" "$FUNCTION_CALL" remote-private
grep -Fq 'auth=present git <-c> <credential.https://github.com.helper=>' \
  "$WORKDIR/remote-private.trace"
grep -Fq '<fetch> <-q> <--depth> <1> <origin>' "$WORKDIR/remote-private.trace"

# The deploy-branch path must also have a credential-free public fallback.
FUNCTION_CALL="github_clone_repo cogni-test-org/cogni-monorepo $WORKDIR/deploy-public"
run_helper "" "$FUNCTION_CALL" deploy-public
grep -Fxq \
  "auth=absent git <clone> <https://github.com/cogni-test-org/cogni-monorepo.git> <$WORKDIR/deploy-public>" \
  "$WORKDIR/deploy-public.trace"

# Authenticated clones use gh's credential helper. The raw token must remain
# absent even when the caller has xtrace enabled.
FUNCTION_CALL="github_clone_repo cogni-test-org/private-node $WORKDIR/deploy-private"
run_helper "$SECRET" "$FUNCTION_CALL" deploy-private
grep -Fq 'auth=present git <-c> <credential.https://github.com.helper=>' \
  "$WORKDIR/deploy-private.trace"
grep -Fq '<!gh auth git-credential>' "$WORKDIR/deploy-private.trace"
grep -Fq '<clone> <https://github.com/cogni-test-org/private-node.git>' \
  "$WORKDIR/deploy-private.trace"
grep -Fq '<config> <--local> <--add> <credential.https://github.com.helper> <!gh auth git-credential>' \
  "$WORKDIR/deploy-private.trace"

# Reject non-GitHub and path-injection inputs before invoking git.
if GH_TOKEN='' github_https_url 'https://example.com/not-github/repo.git' \
  > "$WORKDIR/invalid.out" 2> "$WORKDIR/invalid.err"; then
  echo "expected invalid repository to fail" >&2
  exit 1
fi
grep -Fq 'Invalid GitHub repository' "$WORKDIR/invalid.err"

# Candidate flight must route both duplicated materialization sites and both
# deploy-branch clones through the helper, with no credential-bearing URL left.
WORKFLOW="$REPO_ROOT/.github/workflows/candidate-flight.yml"
[ "$(grep -c 'github_materialize_commit ' "$WORKFLOW")" -eq 2 ]
[ "$(grep -c 'github_clone_repo ' "$WORKFLOW")" -eq 2 ]
if grep -Fq 'x-access-token' "$WORKFLOW"; then
  echo "candidate-flight still embeds a token in a Git remote URL" >&2
  exit 1
fi

echo "all cases passed"
