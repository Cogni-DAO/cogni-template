#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
# SPDX-FileCopyrightText: 2026 Cogni-DAO
#
# Module: scripts/ci/tests/render-compute-egress-allowlist.test.sh
# Purpose: Prove the catalog→VM compute-egress allowlist path (task.5052):
#   1. render-compute-egress-allowlist.sh renders per-env allow lines from a
#      catalog fixture (env scoping, dedupe, determinism, fail-loud validation);
#   2. harden-docker-public-ports.sh (faked iptables) installs the staged render
#      and places ACCEPTs ahead of the public DROP;
#   3. idempotency — re-running produces byte-identical rules;
#   4. fail-closed — an empty render yields NO compute ACCEPTs while the public
#      DROP remains, and catalog removal converges on the next run.
# Usage: bash scripts/ci/tests/render-compute-egress-allowlist.test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RENDERER="$REPO_ROOT/scripts/ci/render-compute-egress-allowlist.sh"
HARDEN="$REPO_ROOT/infra/provision/cherry/harden-docker-public-ports.sh"

TMPROOT=$(mktemp -d -t render-compute-egress.XXXXXX)
trap 'rm -rf "$TMPROOT"' EXIT

PASS=0
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { PASS=$((PASS + 1)); echo "ok $PASS - $*"; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Catalog fixture
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CATALOG="$TMPROOT/catalog"
mkdir -p "$CATALOG"

cat > "$CATALOG/toksa.yaml" <<'EOF'
name: toksa
type: node
envs: [candidate-a]
compute_egress_cidrs:
  - cidr: 80.200.246.35/32
    comment: shared zencloud+digitalfrontier Akash egress NAT (story.5016)
  - cidr: 198.51.100.0/24
    comment: second provider block (fixture)
EOF

cat > "$CATALOG/toksb.yaml" <<'EOF'
name: toksb
type: node
envs: [preview]
compute_egress_cidrs:
  - cidr: 203.0.113.7/32
    comment: preview-only provider (fixture)
EOF

# Duplicate CIDR from a second candidate-a row — must render exactly once.
cat > "$CATALOG/toksdup.yaml" <<'EOF'
name: toksdup
type: node
envs: [candidate-a]
compute_egress_cidrs:
  - cidr: 80.200.246.35/32
    comment: same NAT reused by another node (fixture)
EOF

# Rows without the field / without envs must contribute nothing.
cat > "$CATALOG/plain.yaml" <<'EOF'
name: plain
type: node
envs: [candidate-a, preview]
EOF
cat > "$CATALOG/infraonly.yaml" <<'EOF'
name: infraonly
type: infra
EOF

export COGNI_CATALOG_ROOT="$CATALOG"
PORTS="5432,5435,6379,4000,7233"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 1. Renderer: env scoping + dedupe + exact allow lines
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUT_A="$TMPROOT/candidate-a.list"
bash "$RENDERER" candidate-a > "$OUT_A"

EXPECTED_A="$TMPROOT/candidate-a.expected"
grep -v '^#' "$OUT_A" > "$TMPROOT/candidate-a.rules" || true
cat > "$EXPECTED_A" <<EOF
80.200.246.35/32:$PORTS
198.51.100.0/24:$PORTS
EOF
diff -u "$EXPECTED_A" "$TMPROOT/candidate-a.rules" \
  || fail "candidate-a rules differ from expected (env union + first-wins dedupe)"
ok "candidate-a renders exactly its env's CIDRs, port-scoped, deduped"

grep -q '203.0.113.7' "$OUT_A" && fail "preview-only CIDR leaked into candidate-a"
ok "preview-only CIDR excluded from candidate-a"

grep -q '^# toksa: shared zencloud+digitalfrontier' "$OUT_A" \
  || fail "provenance comment missing from render"
ok "catalog comments carried into rendered file"

OUT_P="$TMPROOT/preview.list"
bash "$RENDERER" preview > "$OUT_P"
[ "$(grep -cv '^#' "$OUT_P")" = "1" ] || fail "preview should have exactly 1 rule"
grep -q "^203.0.113.7/32:$PORTS$" "$OUT_P" || fail "preview rule wrong"
ok "preview renders only its own row's CIDR"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 2. Renderer: empty env + idempotency + fail-loud validation
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUT_PROD="$TMPROOT/production.list"
bash "$RENDERER" production > "$OUT_PROD"
if grep -qv '^#' "$OUT_PROD"; then
  fail "production (no declaring rows) must render zero allow lines"
fi
ok "env with no external compute renders an allow-free (fail-closed) file"

bash "$RENDERER" candidate-a > "$TMPROOT/candidate-a.second"
diff -u "$OUT_A" "$TMPROOT/candidate-a.second" || fail "renderer is not deterministic"
ok "renderer is deterministic/idempotent"

cat > "$CATALOG/broken.yaml" <<'EOF'
name: broken
type: node
envs: [candidate-a]
compute_egress_cidrs:
  - cidr: not-a-cidr
    comment: bad
EOF
if bash "$RENDERER" candidate-a > /dev/null 2>&1; then
  fail "renderer must fail LOUD on an invalid CIDR"
fi
rm "$CATALOG/broken.yaml"
ok "invalid CIDR aborts the render (never warn-skipped on the VM)"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Fake VM toolchain for harden-docker-public-ports.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FAKEBIN="$TMPROOT/bin"
mkdir -p "$FAKEBIN"
export IPT_STATE="$TMPROOT/iptables.state"
: > "$IPT_STATE"

cat > "$FAKEBIN/iptables" <<'EOF'
#!/usr/bin/env bash
# Stateful fake: one DOCKER-USER rule per line in $IPT_STATE (append order).
set -euo pipefail
case "${1:-}" in
  -L)
    # -L DOCKER-USER [--line-numbers] -n
    if printf '%s\n' "$@" | grep -qx -- '--line-numbers'; then
      echo "Chain DOCKER-USER (1 references)"
      echo "num  target  prot  source"
      nl -ba -w1 -s'    ' "$IPT_STATE"
    fi
    exit 0
    ;;
  -D)
    ln="$3"
    sed -i.bak "${ln}d" "$IPT_STATE"
    exit 0
    ;;
  -A)
    shift 2
    echo "$*" >> "$IPT_STATE"
    exit 0
    ;;
  -S)
    sed 's/^/-A DOCKER-USER /' "$IPT_STATE"
    exit 0
    ;;
esac
exit 0
EOF
chmod +x "$FAKEBIN/iptables"

cat > "$FAKEBIN/ip" <<'EOF'
#!/usr/bin/env bash
echo "8.8.8.8 via 192.0.2.1 dev eth0 src 192.0.2.10 uid 0"
EOF
chmod +x "$FAKEBIN/ip"

for tool in apt-get netfilter-persistent; do
  printf '#!/usr/bin/env bash\nexit 0\n' > "$FAKEBIN/$tool"
  chmod +x "$FAKEBIN/$tool"
done

export ALLOWLIST_FILE="$TMPROOT/etc/compute-egress-allowlist"
export STAGED_ALLOWLIST="$TMPROOT/staged-allowlist"

run_harden() {
  PATH="$FAKEBIN:$PATH" bash "$HARDEN" > "$TMPROOT/harden.log" 2>&1 \
    || { cat "$TMPROOT/harden.log" >&2; fail "harden script exited nonzero"; }
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 3. Harden: staged render → ACCEPTs ahead of the public DROP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cp "$OUT_A" "$STAGED_ALLOWLIST"
run_harden

RULES_1="$TMPROOT/rules.1"
PATH="$FAKEBIN:$PATH" iptables -S DOCKER-USER > "$RULES_1"

grep -q -- "-s 80.200.246.35/32 -p tcp -m multiport --dports $PORTS .*compute-egress-allow.* ACCEPT" "$RULES_1" \
  || { cat "$RULES_1" >&2; fail "catalog CIDR did not become a port-scoped ACCEPT"; }
grep -q -- "-s 198.51.100.0/24 .*compute-egress-allow" "$RULES_1" || fail "second CIDR missing"
allow_line=$(grep -n 'compute-egress-allow' "$RULES_1" | head -1 | cut -d: -f1)
drop_line=$(grep -n 'drop-public' "$RULES_1" | cut -d: -f1)
[ -n "$drop_line" ] || fail "public DROP rule missing"
[ "$allow_line" -lt "$drop_line" ] || fail "ACCEPT must precede the public DROP"
ok "staged render becomes ACCEPT rules ahead of the public DROP"

[ "$(cat "$ALLOWLIST_FILE")" = "$(cat "$STAGED_ALLOWLIST")" ] \
  || fail "staged file was not installed to ALLOWLIST_FILE"
ok "staged catalog render installed as the persistent allowlist"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 4. Harden: idempotency + empty-render fail-closed convergence
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
run_harden
PATH="$FAKEBIN:$PATH" iptables -S DOCKER-USER > "$TMPROOT/rules.2"
diff -u "$RULES_1" "$TMPROOT/rules.2" || fail "re-run must produce identical rules"
ok "harden re-run is idempotent (byte-identical rules)"

# Catalog removal: stage the (empty) production render over the same VM state.
cp "$OUT_PROD" "$STAGED_ALLOWLIST"
run_harden
PATH="$FAKEBIN:$PATH" iptables -S DOCKER-USER > "$TMPROOT/rules.3"
grep -q 'compute-egress-allow' "$TMPROOT/rules.3" \
  && fail "removed catalog CIDRs must be removed from rules on next run"
grep -q 'drop-public' "$TMPROOT/rules.3" \
  || fail "empty allowlist must keep the public DROP (fail-closed, never open)"
ok "empty render converges: no ACCEPTs remain, public DROP stays (fail-closed)"

# No staged file at all (cloud-init boot): last installed state is reused.
rm "$STAGED_ALLOWLIST"
cp "$OUT_A" "$ALLOWLIST_FILE"
run_harden
PATH="$FAKEBIN:$PATH" iptables -S DOCKER-USER > "$TMPROOT/rules.4"
grep -q 'compute-egress-allow' "$TMPROOT/rules.4" \
  || fail "without a staged file, the installed allowlist must still apply"
ok "no staged file: previously installed allowlist still renders (boot path)"

echo "PASS: all $PASS assertions"
