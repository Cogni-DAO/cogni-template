#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2026 Cogni-DAO

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
SCRIPT="$ROOT/scripts/ci/candidate-parent-cutover.sh"
TMP=$(mktemp -d)
SOURCE="$TMP/source.git"
TARGET="$TMP/target.git"
WORK="$TMP/work"
MANIFEST="$TMP/manifest.json"

git init --bare -q "$SOURCE"
git init --bare -q "$TARGET"
git init -q "$WORK"
git -C "$WORK" config user.name test
git -C "$WORK" config user.email test@example.com
printf 'base\n' >"$WORK/state.txt"
git -C "$WORK" add state.txt
git -C "$WORK" commit -qm base

branches=(
  deploy/candidate-a
  deploy/candidate-a-beacon
  deploy/candidate-a-node-template
  deploy/candidate-a-operator
  deploy/candidate-a-poly
  deploy/candidate-a-scheduler-worker
  deploy/candidate-a-toks4
)
declare -A SHAS=()
for branch in "${branches[@]}"; do
  printf '%s\n' "$branch" >>"$WORK/state.txt"
  git -C "$WORK" commit -qam "$branch"
  SHAS["$branch"]=$(git -C "$WORK" rev-parse HEAD)
  git -C "$WORK" push -q "$SOURCE" "HEAD:refs/heads/$branch"
done
SOURCE_MAIN=$(git -C "$WORK" rev-parse HEAD)
git -C "$WORK" push -q "$SOURCE" "HEAD:refs/heads/main"

jq -n \
  --arg main "$SOURCE_MAIN" \
  --arg umbrella "${SHAS[deploy/candidate-a]}" \
  --arg beacon "${SHAS[deploy/candidate-a-beacon]}" \
  --arg node_template "${SHAS[deploy/candidate-a-node-template]}" \
  --arg operator "${SHAS[deploy/candidate-a-operator]}" \
  --arg poly "${SHAS[deploy/candidate-a-poly]}" \
  --arg scheduler "${SHAS[deploy/candidate-a-scheduler-worker]}" \
  --arg toks4 "${SHAS[deploy/candidate-a-toks4]}" '
  {
    schemaVersion:1,
    environment:"candidate-a",
    sourceRepository:"cogni-dao/cogni",
    sourceMainSha:$main,
    targetRepository:"cogni-test-org/cogni-monorepo",
    rootManifest:"infra/k8s/argocd/control-plane/roots/candidate-a-control-plane-application.yaml",
    branches: [
      {name:"deploy/candidate-a",sha:$umbrella,role:"environment"},
      {name:"deploy/candidate-a-beacon",sha:$beacon,role:"application",app:"beacon",sourceSha:$beacon,image:"ghcr.io/test/beacon@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
      {name:"deploy/candidate-a-node-template",sha:$node_template,role:"application",app:"node-template",sourceSha:$node_template,image:"ghcr.io/test/node-template@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
      {name:"deploy/candidate-a-operator",sha:$operator,role:"application",app:"operator",sourceSha:$operator,image:"ghcr.io/test/operator@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},
      {name:"deploy/candidate-a-poly",sha:$poly,role:"application",app:"poly",sourceSha:$poly,image:"ghcr.io/test/poly@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},
      {name:"deploy/candidate-a-scheduler-worker",sha:$scheduler,role:"application",app:"scheduler-worker",sourceSha:$scheduler,image:"ghcr.io/test/scheduler-worker@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},
      {name:"deploy/candidate-a-toks4",sha:$toks4,role:"application",app:"toks4",sourceSha:$toks4,image:"ghcr.io/test/toks4@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"}
    ]
  }' >"$MANIFEST"

CUTOVER_MANIFEST="$MANIFEST" bash "$SCRIPT" validate

git -C "$WORK" remote add origin "$TARGET"
printf 'stale\n' >>"$WORK/state.txt"
git -C "$WORK" commit -qam stale
git -C "$WORK" push -q origin "HEAD:refs/heads/deploy/candidate-a"

(
  cd "$WORK"
  CUTOVER_MANIFEST="$MANIFEST" \
    SOURCE_REPO_URL="$SOURCE" \
    TARGET_REPO_URL="$TARGET" \
    RUNNER_TEMP="$TMP" \
    bash "$SCRIPT" mirror
)

for branch in "${branches[@]}"; do
  actual=$(git --git-dir="$TARGET" rev-parse "refs/heads/$branch")
  test "$actual" = "${SHAS[$branch]}" || {
    echo "FAIL: $branch not mirrored exactly" >&2
    exit 1
  }
done

jq 'del(.branches[-1])' "$MANIFEST" >"$TMP/invalid.json"
if CUTOVER_MANIFEST="$TMP/invalid.json" bash "$SCRIPT" validate >/dev/null 2>&1; then
  echo "FAIL: incomplete roster accepted" >&2
  exit 1
fi

echo "PASS: candidate-parent-cutover.test.sh"
