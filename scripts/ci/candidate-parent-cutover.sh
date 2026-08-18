#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2026 Cogni-DAO
#
# One controlled candidate-a deployment-parent cutover. This deliberately does
# not provision, rebuild, or promote. It mirrors the seven reviewed deploy refs
# byte-for-byte, proves the live Argo state consumes those exact revisions, then
# changes only the root Application's repository and proves workload identity,
# images, and resource requests did not change.

set -euo pipefail

COMMAND="${1:-run}"
MANIFEST="${CUTOVER_MANIFEST:-infra/candidate-a-parent-cutover.json}"
SOURCE_REMOTE="${SOURCE_REPO_URL:-https://github.com/cogni-dao/cogni.git}"
TARGET_REMOTE="${TARGET_REPO_URL:-origin}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/deploy_key}"
VM_HOST="${VM_HOST:-}"
SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 -o ServerAliveInterval=10 -o ServerAliveCountMax=6)
SNAPSHOT_DIR="${RUNNER_TEMP:-$(mktemp -d)}/candidate-parent-cutover"
ROOT_APPLIED=0
CUTOVER_SUCCEEDED=0

die() {
  echo "::error::$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command missing: $1"
}

manifest_value() {
  jq -er "$1" "$MANIFEST"
}

validate_manifest() {
  require_command jq
  [[ -f "$MANIFEST" ]] || die "cutover manifest missing: $MANIFEST"

  [[ "$(manifest_value '.schemaVersion')" == "1" ]] || die "unsupported cutover manifest version"
  [[ "$(manifest_value '.environment')" == "candidate-a" ]] || die "cutover is fixed to candidate-a"
  [[ "$(manifest_value '.sourceRepository')" == "cogni-dao/cogni" ]] || die "unexpected source repository"
  [[ "$(manifest_value '.targetRepository')" == "cogni-test-org/cogni-monorepo" ]] || die "unexpected target repository"
  [[ "$(manifest_value '.rootManifest')" == "infra/k8s/argocd/control-plane/roots/candidate-a-control-plane-application.yaml" ]] || die "unexpected root manifest"

  local expected actual
  expected=$(printf '%s\n' \
    deploy/candidate-a \
    deploy/candidate-a-beacon \
    deploy/candidate-a-node-template \
    deploy/candidate-a-operator \
    deploy/candidate-a-poly \
    deploy/candidate-a-scheduler-worker \
    deploy/candidate-a-toks4 | sort)
  actual=$(jq -r '.branches[].name' "$MANIFEST" | sort)
  [[ "$actual" == "$expected" ]] || die "manifest must contain exactly umbrella + six candidate-a application refs"
  [[ "$(jq '[.branches[].name] | length == (unique | length)' "$MANIFEST")" == "true" ]] || die "manifest contains duplicate refs"
  jq -e '
    (.sourceMainSha | test("^[0-9a-f]{40}$")) and
    (all(.branches[]; .sha | test("^[0-9a-f]{40}$"))) and
    (all(.branches[] | select(.role == "application");
      (.app | type == "string") and
      (.sourceSha | test("^[0-9a-f]{40}$")) and
      (.image | test("^ghcr\\.io/.+@sha256:[0-9a-f]{64}$")))) and
    ([.branches[] | select(.role == "environment")] | length == 1) and
    ([.branches[] | select(.role == "application")] | length == 6)
  ' "$MANIFEST" >/dev/null || die "invalid sha, role, sourceSha, or digest in manifest"
}

fetch_source_refs() {
  require_command git
  local -a refspecs=()
  while IFS=$'\t' read -r branch _; do
    local local_ref="refs/cutover/source/${branch#deploy/}"
    refspecs+=("+refs/heads/${branch}:${local_ref}")
  done < <(jq -r '.branches[] | [.name,.sha] | @tsv' "$MANIFEST")
  local source_main_sha
  source_main_sha=$(manifest_value '.sourceMainSha')
  refspecs+=("+${source_main_sha}:refs/cutover/source/main")
  git fetch --quiet --no-tags "$SOURCE_REMOTE" "${refspecs[@]}"

  while IFS=$'\t' read -r branch expected_sha; do
    local local_ref="refs/cutover/source/${branch#deploy/}"
    local actual_sha
    actual_sha=$(git rev-parse "$local_ref")
    [[ "$actual_sha" == "$expected_sha" ]] || die "source ref moved: ${branch} expected ${expected_sha}, got ${actual_sha}"
  done < <(jq -r '.branches[] | [.name,.sha] | @tsv' "$MANIFEST")

  [[ "$(git rev-parse refs/cutover/source/main)" == "$source_main_sha" ]] || die "source main snapshot unavailable"
}

prepare_rollback_root() {
  local root_manifest rollback_repo
  root_manifest=$(manifest_value '.rootManifest')
  rollback_repo="https://github.com/$(manifest_value '.sourceRepository').git"
  mkdir -p "$SNAPSHOT_DIR"
  git show "refs/cutover/source/main:${root_manifest}" >"$SNAPSHOT_DIR/root-rollback.yaml"
  [[ "$(yq -r '.spec.source.repoURL' "$SNAPSHOT_DIR/root-rollback.yaml")" == "$rollback_repo" ]] || die "source-main rollback root does not point at the source repository"
}

capture_target_leases() {
  mkdir -p "$SNAPSHOT_DIR"
  : >"$SNAPSHOT_DIR/target-ref-leases.tsv"
  git ls-remote --heads "$TARGET_REMOTE" 'refs/heads/deploy/candidate-a*' >"$SNAPSHOT_DIR/target-remote-refs.tsv"
  while IFS= read -r branch; do
    local sha
    sha=$(awk -v ref="refs/heads/${branch}" '$2 == ref { print $1 }' "$SNAPSHOT_DIR/target-remote-refs.tsv")
    printf '%s\t%s\n' "$branch" "$sha" >>"$SNAPSHOT_DIR/target-ref-leases.tsv"
  done < <(jq -r '.branches[].name' "$MANIFEST")
}

mirror_refs() {
  validate_manifest
  fetch_source_refs
  capture_target_leases

  local -a push_args=()
  while IFS=$'\t' read -r branch expected_sha; do
    local current_sha source_ref
    current_sha=$(awk -F '\t' -v branch="$branch" '$1 == branch { print $2 }' "$SNAPSHOT_DIR/target-ref-leases.tsv")
    source_ref="refs/cutover/source/${branch#deploy/}"
    [[ "$(git rev-parse "$source_ref")" == "$expected_sha" ]] || die "local source ref mismatch for ${branch}"
    if [[ "$current_sha" == "$expected_sha" ]]; then
      continue
    fi
    push_args+=("--force-with-lease=refs/heads/${branch}:${current_sha}")
    push_args+=("${source_ref}:refs/heads/${branch}")
  done < <(jq -r '.branches[] | [.name,.sha] | @tsv' "$MANIFEST")

  if ((${#push_args[@]} > 0)); then
    if [[ "${CUTOVER_DRY_RUN:-0}" == "1" ]]; then
      echo "DRY_RUN: would atomically mirror seven reviewed candidate-a refs"
      return 0
    fi
    git push --atomic "$TARGET_REMOTE" "${push_args[@]}"
  fi

  local -a target_refspecs=()
  while IFS= read -r branch; do
    target_refspecs+=("+refs/heads/${branch}:refs/cutover/target/${branch#deploy/}")
  done < <(jq -r '.branches[].name' "$MANIFEST")
  git fetch --quiet --no-tags "$TARGET_REMOTE" "${target_refspecs[@]}"

  while IFS=$'\t' read -r branch expected_sha; do
    local target_sha source_ref target_ref
    target_ref="refs/cutover/target/${branch#deploy/}"
    target_sha=$(git rev-parse "$target_ref")
    [[ "$target_sha" == "$expected_sha" ]] || die "target ref mismatch after mirror: ${branch} expected ${expected_sha}, got ${target_sha:-missing}"
    source_ref="refs/cutover/source/${branch#deploy/}"
    [[ "$(git rev-parse "${target_ref}^{tree}")" == "$(git rev-parse "${source_ref}^{tree}")" ]] || die "target tree mismatch after mirror: ${branch}"
    printf 'verified %s commit=%s tree=%s\n' "$branch" "$target_sha" "$(git rev-parse "${target_ref}^{tree}")"
  done < <(jq -r '.branches[] | [.name,.sha] | @tsv' "$MANIFEST")
}

remote_kubectl() {
  local remote_command
  printf -v remote_command '%q ' kubectl "$@"
  ssh "${SSH_OPTS[@]}" "root@${VM_HOST}" "$remote_command"
}

assert_target_main_contract() {
  local expected_repo
  expected_repo="https://github.com/$(manifest_value '.targetRepository').git"
  local root_manifest
  root_manifest=$(manifest_value '.rootManifest')
  [[ -f "$root_manifest" ]] || die "root manifest absent from target main checkout"
  [[ "$(yq -r '.spec.source.repoURL' "$root_manifest")" == "$expected_repo" ]] || die "target root does not point at target repository"
  [[ "$(yq -r '.spec.source.targetRevision' "$root_manifest")" == "main" ]] || die "target root must watch main"

  local appsets_manifest="infra/k8s/argocd/control-plane/candidate-a/candidate-a-appsets-application.yaml"
  [[ "$(yq -r '.spec.source.repoURL' "$appsets_manifest")" == "$expected_repo" ]] || die "target app-of-apps does not point at target repository"

  local expected_apps actual_apps
  expected_apps=$(jq -r '.branches[] | select(.role == "application") | .app' "$MANIFEST" | sort)
  actual_apps=$(yq -r '.resources[]' infra/k8s/argocd/appsets/candidate-a/kustomization.yaml | sed -E 's/^candidate-a-(.+)-applicationset\.yaml$/\1/' | sort)
  [[ "$actual_apps" == "$expected_apps" ]] || die "target-main candidate-a AppSet roster differs from cutover manifest"

  while IFS=$'\t' read -r app branch; do
    local appset="infra/k8s/argocd/appsets/candidate-a/candidate-a-${app}-applicationset.yaml"
    [[ -f "$appset" ]] || die "missing target AppSet for ${app}"
    [[ "$(yq -r '.spec.template.spec.source.repoURL' "$appset")" == "$expected_repo" ]] || die "${app} AppSet points at wrong repository"
    [[ "$(yq -r '.spec.template.spec.source.targetRevision' "$appset")" == 'deploy/candidate-a-{{.name}}' ]] || die "${app} AppSet has unexpected revision template"
    [[ "$branch" == "deploy/candidate-a-${app}" ]] || die "manifest branch/app mismatch for ${app}"
  done < <(jq -r '.branches[] | select(.role == "application") | [.app,.name] | @tsv' "$MANIFEST")
}

assert_no_active_source_flights() {
  require_command curl
  local workflow run_state count response
  for workflow in candidate-flight.yml candidate-flight-infra.yml; do
    for run_state in queued in_progress; do
      response=$(curl -fsS --max-time 15 \
        -H 'Accept: application/vnd.github+json' \
        -H 'X-GitHub-Api-Version: 2022-11-28' \
        "https://api.github.com/repos/$(manifest_value '.sourceRepository')/actions/workflows/${workflow}/runs?status=${run_state}&per_page=1") || die "could not inspect public source workflow state"
      count=$(jq -er '.total_count' <<<"$response")
      [[ "$count" == "0" ]] || die "source ${workflow} has a ${run_state} run; candidate-a is not quiescent"
    done
  done
}

capture_live_state() {
  [[ -n "$VM_HOST" ]] || die "VM_HOST is required"
  [[ -s "$SSH_KEY" ]] || die "SSH key is required"
  mkdir -p "$SNAPSHOT_DIR"
  ssh "${SSH_OPTS[@]}" "root@${VM_HOST}" 'kubectl version --client >/dev/null && kubectl get node >/dev/null' || die "candidate-a SSH/kubectl preflight failed"

  remote_kubectl -n argocd get applications.argoproj.io -o json >"$SNAPSHOT_DIR/applications-before.json"
  remote_kubectl -n argocd get applicationsets.argoproj.io -o json >"$SNAPSHOT_DIR/appsets-before.json"
  remote_kubectl -n cogni-candidate-a get deployments.apps -o json >"$SNAPSHOT_DIR/deployments-before.json"

  jq '[.items[] | select(.metadata.name | startswith("candidate-a-")) | {
    name:.metadata.name,
    uid:.metadata.uid,
    repo:.spec.source.repoURL,
    revision:.spec.source.targetRevision,
    syncRevision:.status.sync.revision,
    sync:.status.sync.status,
    health:.status.health.status
  }] | sort_by(.name)' "$SNAPSHOT_DIR/applications-before.json" >"$SNAPSHOT_DIR/apps-normalized-before.json"
  jq '[.items[] | {name:.metadata.name,uid:.metadata.uid,spec:.spec}] | sort_by(.name)' \
    "$SNAPSHOT_DIR/deployments-before.json" >"$SNAPSHOT_DIR/workloads-normalized-before.json"

  local expected_repo
  expected_repo="https://github.com/$(manifest_value '.sourceRepository').git"
  [[ "$(remote_kubectl -n argocd get application cogni-candidate-a-control-plane -o jsonpath='{.spec.source.repoURL}')" == "$expected_repo" ]] || die "live candidate-a root is not owned by the declared source repository"
  [[ "$(remote_kubectl -n argocd get application cogni-candidate-a-appsets -o jsonpath='{.spec.source.repoURL}')" == "$expected_repo" ]] || die "live candidate-a app-of-apps is not owned by the declared source repository"
  local expected_appsets actual_appsets
  expected_appsets=$(jq -r '.branches[] | select(.role == "application") | "cogni-candidate-a-" + .app' "$MANIFEST" | sort)
  actual_appsets=$(jq -r '.items[] | select(.metadata.name | startswith("cogni-candidate-a-")) | .metadata.name' "$SNAPSHOT_DIR/appsets-before.json" | sort)
  [[ "$actual_appsets" == "$expected_appsets" ]] || die "live candidate-a AppSet roster differs from the reviewed six"
  jq -e --arg repo "$expected_repo" '
    all(.items[] | select(.metadata.name | startswith("cogni-candidate-a-"));
      .spec.template.spec.source.repoURL == $repo and
      .spec.template.spec.source.targetRevision == "deploy/candidate-a-{{.name}}")
  ' "$SNAPSHOT_DIR/appsets-before.json" >/dev/null || die "live candidate-a AppSet source contract differs from canonical"
  [[ "$(jq 'length' "$SNAPSHOT_DIR/apps-normalized-before.json")" == "6" ]] || die "live candidate-a roster is not exactly six Applications"
  while IFS=$'\t' read -r app branch sha image; do
    jq -e --arg name "candidate-a-${app}" --arg repo "$expected_repo" --arg branch "$branch" --arg sha "$sha" '
      any(.[]; .name == $name and .repo == $repo and .revision == $branch and .syncRevision == $sha and .sync == "Synced" and .health == "Healthy")
    ' "$SNAPSHOT_DIR/apps-normalized-before.json" >/dev/null || die "live ${app} Application is not healthy on the frozen canonical ref"
    jq -e --arg image "$image" 'any(.[]; any(.spec.template.spec.containers[]; .image == $image))' "$SNAPSHOT_DIR/workloads-normalized-before.json" >/dev/null || die "live ${app} image does not match the cutover manifest"
  done < <(jq -r '.branches[] | select(.role == "application") | [.app,.name,.sha,.image] | @tsv' "$MANIFEST")
}

apply_root_and_verify() {
  local root_manifest expected_repo
  root_manifest=$(manifest_value '.rootManifest')
  expected_repo="https://github.com/$(manifest_value '.targetRepository').git"
  local remote_root="/tmp/candidate-a-control-plane-application-${GITHUB_RUN_ID:-manual}.yaml"
  scp "${SSH_OPTS[@]}" "$root_manifest" "root@${VM_HOST}:${remote_root}"
  # shellcheck disable=SC2029 # remote_root is a fixed, locally-generated path.
  ssh "${SSH_OPTS[@]}" "root@${VM_HOST}" "kubectl apply --server-side --dry-run=server -f '${remote_root}' >/dev/null"
  # Apply is isolated so any later refresh/verification error reliably triggers
  # the EXIT rollback instead of leaving the root switched with ROOT_APPLIED=0.
  # shellcheck disable=SC2029 # remote_root is a fixed, locally-generated path.
  ssh "${SSH_OPTS[@]}" "root@${VM_HOST}" "kubectl apply --server-side -f '${remote_root}' >/dev/null"
  ROOT_APPLIED=1
  remote_kubectl -n argocd annotate application cogni-candidate-a-control-plane argocd.argoproj.io/refresh=hard --overwrite >/dev/null

  local deadline=$((SECONDS + 300))
  while ((SECONDS < deadline)); do
    local root_repo appsets_repo healthy_count target_appsets control_healthy
    root_repo=$(remote_kubectl -n argocd get application cogni-candidate-a-control-plane -o jsonpath='{.spec.source.repoURL}' 2>/dev/null || true)
    appsets_repo=$(remote_kubectl -n argocd get application cogni-candidate-a-appsets -o jsonpath='{.spec.source.repoURL}' 2>/dev/null || true)
    healthy_count=$(remote_kubectl -n argocd get applications -o json | jq '[.items[] | select(.metadata.name | startswith("candidate-a-")) | select(.status.sync.status == "Synced" and .status.health.status == "Healthy")] | length')
    target_appsets=$(remote_kubectl -n argocd get applicationsets -o json | jq --arg repo "$expected_repo" '[.items[] | select(.metadata.name | startswith("cogni-candidate-a-")) | select(.spec.template.spec.source.repoURL == $repo)] | length')
    control_healthy=$(remote_kubectl -n argocd get applications -o json | jq --arg repo "$expected_repo" '[.items[] | select(.metadata.name == "cogni-candidate-a-control-plane" or .metadata.name == "cogni-candidate-a-appsets") | select(.spec.source.repoURL == $repo and .status.sync.status == "Synced" and .status.health.status == "Healthy")] | length')
    if [[ "$root_repo" == "$expected_repo" && "$appsets_repo" == "$expected_repo" && "$healthy_count" == "6" && "$target_appsets" == "6" && "$control_healthy" == "2" ]]; then
      break
    fi
    sleep 10
  done

  [[ "$(remote_kubectl -n argocd get application cogni-candidate-a-control-plane -o jsonpath='{.spec.source.repoURL}')" == "$expected_repo" ]] || die "root did not adopt target repository"
  [[ "$(remote_kubectl -n argocd get application cogni-candidate-a-appsets -o jsonpath='{.spec.source.repoURL}')" == "$expected_repo" ]] || die "app-of-apps did not adopt target repository"

  remote_kubectl -n argocd get applications.argoproj.io -o json >"$SNAPSHOT_DIR/applications-after.json"
  remote_kubectl -n argocd get applicationsets.argoproj.io -o json >"$SNAPSHOT_DIR/appsets-after.json"
  remote_kubectl -n cogni-candidate-a get deployments.apps -o json >"$SNAPSHOT_DIR/deployments-after.json"
  jq -e --arg repo "$expected_repo" '
    ([.items[] | select(.metadata.name == "cogni-candidate-a-control-plane" or .metadata.name == "cogni-candidate-a-appsets") | select(.spec.source.repoURL == $repo and .status.sync.status == "Synced" and .status.health.status == "Healthy")] | length) == 2
  ' "$SNAPSHOT_DIR/applications-after.json" >/dev/null || die "target root/app-of-apps did not become Synced and Healthy"
  local expected_appsets actual_appsets
  expected_appsets=$(jq -r '.branches[] | select(.role == "application") | "cogni-candidate-a-" + .app' "$MANIFEST" | sort)
  actual_appsets=$(jq -r '.items[] | select(.metadata.name | startswith("cogni-candidate-a-")) | .metadata.name' "$SNAPSHOT_DIR/appsets-after.json" | sort)
  [[ "$actual_appsets" == "$expected_appsets" ]] || die "post-cutover AppSet roster differs from the reviewed six"
  jq -e --arg repo "$expected_repo" '
    all(.items[] | select(.metadata.name | startswith("cogni-candidate-a-"));
      .spec.template.spec.source.repoURL == $repo and
      .spec.template.spec.source.targetRevision == "deploy/candidate-a-{{.name}}")
  ' "$SNAPSHOT_DIR/appsets-after.json" >/dev/null || die "post-cutover AppSets do not all use the target repository"
  jq '[.items[] | select(.metadata.name | startswith("candidate-a-")) | {name:.metadata.name,uid:.metadata.uid}] | sort_by(.name)' "$SNAPSHOT_DIR/applications-after.json" >"$SNAPSHOT_DIR/app-uids-after.json"
  jq '[.[] | {name,uid}]' "$SNAPSHOT_DIR/apps-normalized-before.json" >"$SNAPSHOT_DIR/app-uids-before.json"
  diff -u "$SNAPSHOT_DIR/app-uids-before.json" "$SNAPSHOT_DIR/app-uids-after.json" >/dev/null || die "candidate Applications were deleted or recreated during cutover"

  jq '[.items[] | {name:.metadata.name,uid:.metadata.uid,spec:.spec}] | sort_by(.name)' \
    "$SNAPSHOT_DIR/deployments-after.json" >"$SNAPSHOT_DIR/workloads-normalized-after.json"
  diff -u "$SNAPSHOT_DIR/workloads-normalized-before.json" "$SNAPSHOT_DIR/workloads-normalized-after.json" >/dev/null || die "Deployment UID or desired spec changed during cutover"

  while IFS=$'\t' read -r app branch sha; do
    jq -e --arg name "candidate-a-${app}" --arg repo "$expected_repo" --arg branch "$branch" --arg sha "$sha" '
      any(.items[]; .metadata.name == $name and .spec.source.repoURL == $repo and .spec.source.targetRevision == $branch and .status.sync.revision == $sha and .status.sync.status == "Synced" and .status.health.status == "Healthy")
    ' "$SNAPSHOT_DIR/applications-after.json" >/dev/null || die "post-cutover ${app} Application failed repository/revision/health proof"
  done < <(jq -r '.branches[] | select(.role == "application") | [.app,.name,.sha] | @tsv' "$MANIFEST")
}

rollback_on_exit() {
  local rc=$?
  if [[ "$ROOT_APPLIED" == "1" && "$CUTOVER_SUCCEEDED" != "1" && -s "$SNAPSHOT_DIR/root-rollback.yaml" ]]; then
    set +e
    echo "::warning::cutover verification failed; restoring the frozen canonical root"
    local remote_rollback="/tmp/candidate-a-control-plane-rollback-${GITHUB_RUN_ID:-manual}.yaml"
    scp "${SSH_OPTS[@]}" "$SNAPSHOT_DIR/root-rollback.yaml" "root@${VM_HOST}:${remote_rollback}"
    # shellcheck disable=SC2029 # remote_rollback is a fixed, locally-generated path.
    ssh "${SSH_OPTS[@]}" "root@${VM_HOST}" "kubectl apply --server-side --force-conflicts -f '${remote_rollback}' >/dev/null && kubectl -n argocd annotate application cogni-candidate-a-control-plane argocd.argoproj.io/refresh=hard --overwrite >/dev/null"
    echo "::warning::canonical root rollback requested; inspect the proof artifact before retrying"
  fi
  exit "$rc"
}

run_cutover() {
  trap rollback_on_exit EXIT
  validate_manifest
  require_command yq
  require_command ssh
  require_command scp
  [[ "${GITHUB_REPOSITORY:-$(manifest_value '.targetRepository')}" == "$(manifest_value '.targetRepository')" ]] || die "workflow must run in the declared target repository"
  [[ "${GITHUB_REF_NAME:-main}" == "main" ]] || die "cutover must dispatch from target main"
  [[ "${CUTOVER_CONFIRMATION:-}" == "CUTOVER candidate-a cogni-dao/cogni -> cogni-test-org/cogni-monorepo" ]] || die "exact cutover confirmation phrase required"
  assert_target_main_contract
  assert_no_active_source_flights
  capture_live_state
  mirror_refs
  prepare_rollback_root
  assert_no_active_source_flights
  apply_root_and_verify
  assert_no_active_source_flights
  CUTOVER_SUCCEEDED=1
  echo "candidate-a deployment-parent cutover verified"
}

case "$COMMAND" in
  validate) validate_manifest ;;
  mirror) mirror_refs ;;
  run) run_cutover ;;
  *) die "usage: $0 [validate|mirror|run]" ;;
esac
