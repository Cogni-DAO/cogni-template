#!/usr/bin/env bash
# End-to-end demo for the crossplane-akash spike.
#
#   kind up -> crossplane + provider-http + functions -> mock operator API
#   -> apply XAkashWorkload -> reconcile to READY (create+observe)
#   -> CRASH provider mid-create -> ADOPT (no double-create)
#   -> drift a field -> converge (update) -> delete -> release -> (optional) teardown
#
# Everything runs against the in-cluster MOCK. ZERO real escrow is spent.
#
# Env:
#   OPERATOR_COMPUTE_TOKEN   bearer header value (default "Bearer mock-token")
#   KEEP_CLUSTER=1           skip teardown at the end
#   SKIP_TEARDOWN=1          alias for KEEP_CLUSTER
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLUSTER=crossplane-akash
KUBECTL="kubectl --context kind-${CLUSTER}"
TOKEN="${OPERATOR_COMPUTE_TOKEN:-Bearer mock-token}"

banner() { printf '\n\033[1;36m========== %s ==========\033[0m\n' "$*"; }
step()   { printf '\n\033[1;33m--- %s ---\033[0m\n' "$*"; }

mock_curl() { # $1 = path  -> hits the mock from inside the cluster (with auth)
  $KUBECTL -n mock-operator exec deploy/mock-operator -- \
    wget -q -O - --header="authorization: ${TOKEN}" "http://localhost:8080$1"
}

provider_deploy() { $KUBECTL -n crossplane-system get deploy -o name | grep '/provider-http-' | head -1; }
request_name()    { $KUBECTL get request.http.crossplane.io -o name | head -1; }

# ------------------------------------------------------------------ preflight
banner "PREFLIGHT"
for bin in docker kind kubectl helm; do command -v "$bin" >/dev/null || { echo "missing $bin"; exit 1; }; done
docker info >/dev/null 2>&1 || { echo "docker daemon not running"; exit 1; }
echo "tooling OK"

# ------------------------------------------------------------------ kind
banner "KIND CLUSTER"
if kind get clusters | grep -qx "$CLUSTER"; then
  echo "cluster $CLUSTER already exists — reusing"
else
  kind create cluster --config "$HERE/cluster/kind.yaml"
fi
$KUBECTL cluster-info | head -1

# ------------------------------------------------------------------ crossplane core
banner "INSTALL CROSSPLANE CORE (2.4.0)"
helm repo add crossplane-stable https://charts.crossplane.io/stable >/dev/null 2>&1 || true
helm repo update crossplane-stable >/dev/null
helm upgrade --install crossplane crossplane-stable/crossplane \
  --version 2.4.0 -n crossplane-system --create-namespace --wait --timeout 5m
$KUBECTL -n crossplane-system rollout status deploy/crossplane --timeout=180s

# ------------------------------------------------------------------ provider + functions
banner "INSTALL provider-http + composition functions"
$KUBECTL apply -f "$HERE/crossplane/runtimeconfig.yaml"
$KUBECTL apply -f "$HERE/crossplane/provider-http.yaml"
$KUBECTL apply -f "$HERE/crossplane/function-go-templating.yaml"
$KUBECTL apply -f "$HERE/crossplane/function-auto-ready.yaml"

step "waiting for provider + functions to become Healthy (pulls packages)"
$KUBECTL wait provider.pkg/provider-http --for=condition=Healthy --timeout=300s
$KUBECTL wait function.pkg/function-go-templating --for=condition=Healthy --timeout=300s
$KUBECTL wait function.pkg/function-auto-ready --for=condition=Healthy --timeout=300s
$KUBECTL -n crossplane-system rollout status "$(provider_deploy)" --timeout=180s

# ------------------------------------------------------------------ auth secret + providerconfig
banner "PROVIDERCONFIG (bearer token from env, never hardcoded)"
$KUBECTL -n crossplane-system delete secret operator-compute-auth --ignore-not-found >/dev/null
$KUBECTL -n crossplane-system create secret generic operator-compute-auth \
  --from-literal=authorization="$TOKEN"
$KUBECTL apply -f "$HERE/crossplane/providerconfig.yaml"
echo "ProviderConfig operator-compute -> Secret operator-compute-auth (key: authorization)"

# ------------------------------------------------------------------ mock operator API
# ConfigMap FIRST (namespace, then server.js), THEN the Deployment — so the pod
# mounts a valid ConfigMap on its first start and does not churn replicasets.
banner "DEPLOY MOCK OPERATOR COMPUTE API"
$KUBECTL create namespace mock-operator --dry-run=client -o yaml | $KUBECTL apply -f -
$KUBECTL -n mock-operator delete configmap mock-operator-src --ignore-not-found >/dev/null
$KUBECTL -n mock-operator create configmap mock-operator-src --from-file=server.js="$HERE/mock/server.js"
$KUBECTL apply -f "$HERE/mock/k8s.yaml"
# Pick up a changed server.js on re-runs; harmless on a fresh cluster.
$KUBECTL -n mock-operator rollout restart deploy/mock-operator
$KUBECTL -n mock-operator rollout status deploy/mock-operator --timeout=120s
step "mock initial state"
mock_curl /debug/state; echo

# ------------------------------------------------------------------ XRD + Composition
banner "INSTALL XRD + COMPOSITION (the only net-new bespoke)"
$KUBECTL apply -f "$HERE/composition/xrd.yaml"
$KUBECTL wait xrd/xakashworkloads.compute.cogni.io --for=condition=Established --timeout=120s
$KUBECTL apply -f "$HERE/composition/composition.yaml"

# ------------------------------------------------------------------ CREATE / OBSERVE -> READY
banner "APPLY XAkashWorkload -> RECONCILE TO READY"
$KUBECTL apply -f "$HERE/examples/xakashworkload.yaml"
step "waiting for XR to become READY"
$KUBECTL wait xakashworkload/demo-node-app --for=condition=Ready --timeout=180s
step "XR status (leaseId captured as external identity)"
$KUBECTL get xakashworkload/demo-node-app -o jsonpath='{.status}'; echo
step "composed provider-http Request"
$KUBECTL get request.http.crossplane.io -o wide
LEASE_BEFORE="$($KUBECTL get xakashworkload/demo-node-app -o jsonpath='{.status.leaseId}')"
echo "captured leaseId = $LEASE_BEFORE"
step "mock state after create"
mock_curl /debug/state; echo

# ------------------------------------------------------------------ CRASH TEST -> ADOPT
# The crash-safety claim has two parts, proven separately and deterministically:
#
#  A) PROVIDER RECOVERY. Freeze provider-http's view of the Request (crossplane
#     `paused` annotation — you CANNOT just scale the provider down: the crossplane
#     package manager keeps it at replicas=1) and delete the leaseId it durably saved
#     (status.response) = crash window B: the create POST reached the server but the
#     id was never persisted. On unpause, provider-http recovers to the SAME lease
#     (by re-observing its cached id or by re-issuing CREATE and being de-duped). The
#     invariant that matters: NO second lease, SAME leaseId.
#
#  B) SERVER IDEMPOTENCY — the load-bearing property that actually closes window B.
#     Replay provider-http's exact re-issued CREATE POST against the live mock TWICE;
#     it returns the SAME leaseId and mints NO new lease. Mirrors the operator's real
#     allocationCursor/adoption behavior.
banner "CRASH-SAFETY: lose the saved leaseId -> ADOPT the same lease, never double-spend"
jval() { python3 -c "import sys,json;print(json.load(sys.stdin)['$1'])"; }
jlen() { python3 -c "import sys,json;print(len(json.load(sys.stdin)['$1']))"; }
mock_post() { # $1 = json body -> POST to the mock (with auth)
  $KUBECTL -n mock-operator exec deploy/mock-operator -- \
    wget -q -O - --header="authorization: ${TOKEN}" --header="content-type: application/json" \
    --post-data="$1" "http://localhost:8080/api/v1/compute/deployments"
}
BEFORE_JSON="$(mock_curl /debug/state)"
MINTED_BEFORE="$(echo "$BEFORE_JSON" | jval distinctLeasesMinted)"
echo "mock before crash: $BEFORE_JSON"
REQ="$(request_name)"

step "A) freeze the provider's view (pause) + delete the leaseId it had saved (status.response)"
$KUBECTL annotate "$REQ" crossplane.io/paused=true --overwrite
$KUBECTL patch "$REQ" --subresource=status --type=json -p '[{"op":"remove","path":"/status/response"}]'
echo "status.response after removal: '$($KUBECTL get "$REQ" -o jsonpath='{.status.response.body}')'"
echo "unpause -> provider reconciles the leaseId-less Request..."
$KUBECTL annotate "$REQ" crossplane.io/paused- >/dev/null
sleep 20
$KUBECTL wait xakashworkload/demo-node-app --for=condition=Ready --timeout=120s || true
A_JSON="$(mock_curl /debug/state)"
MINTED_A="$(echo "$A_JSON" | jval distinctLeasesMinted)"
ACTIVE_A="$(echo "$A_JSON" | jlen activeLeaseIds)"
LEASE_A="$($KUBECTL get xakashworkload/demo-node-app -o jsonpath='{.status.leaseId}')"
echo "mock after recovery: $A_JSON"
echo "leaseId: $LEASE_BEFORE -> $LEASE_A  |  distinctLeasesMinted: $MINTED_BEFORE -> $MINTED_A  |  activeLeases: $ACTIVE_A"
if [ "$LEASE_A" = "$LEASE_BEFORE" ] && [ "$MINTED_A" = "$MINTED_BEFORE" ] && [ "$ACTIVE_A" = "1" ]; then
  echo -e "\033[1;32mA) RECOVERED to the same lease. No second lease minted.\033[0m"
else
  echo -e "\033[1;31mA) UNEXPECTED — investigate.\033[0m"
fi

step "B) replay provider-http's exact re-issued CREATE POST twice against the live mock"
CREATE_BODY='{"nodeId":"11111111-1111-1111-1111-111111111111","name":"demo-node-app","publicHost":"demo-node.example.com","services":[{"name":"app","image":"ghcr.io/cogni-dao/node-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","cpuUnits":0.5,"memoryMi":512,"storageMi":1024,"port":3000,"visibility":"public"}]}'
L1="$(mock_post "$CREATE_BODY" | jval leaseId)"
L2="$(mock_post "$CREATE_BODY" | jval leaseId)"
B_JSON="$(mock_curl /debug/state)"; MINTED_B="$(echo "$B_JSON" | jval distinctLeasesMinted)"
echo "re-CREATE #1 -> leaseId $L1"
echo "re-CREATE #2 -> leaseId $L2"
echo "distinctLeasesMinted: $MINTED_BEFORE -> $MINTED_B   (expect UNCHANGED — no new lease)"
if [ "$L1" = "$LEASE_BEFORE" ] && [ "$L2" = "$LEASE_BEFORE" ] && [ "$MINTED_B" = "$MINTED_BEFORE" ]; then
  echo -e "\033[1;32mB) SERVER IDEMPOTENT: re-issued CREATE returns the SAME lease, no double-spend. Window B closed.\033[0m"
else
  echo -e "\033[1;31mB) UNEXPECTED — investigate.\033[0m"
fi
LEASE_AFTER="$LEASE_A"

# ------------------------------------------------------------------ DRIFT -> CONVERGE
banner "DRIFT: change memoryMi -> provider-http UPDATE (PUT), same lease"
$KUBECTL patch xakashworkload/demo-node-app --type=merge \
  -p '{"spec":{"services":[{"name":"app","image":"ghcr.io/cogni-dao/node-app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","cpuUnits":0.5,"memoryMi":1024,"storageMi":1024,"port":3000,"visibility":"public"}]}}'
echo "patched memoryMi 512 -> 1024; waiting for converge..."; sleep 25
$KUBECTL wait xakashworkload/demo-node-app --for=condition=Ready --timeout=120s
LEASE_DRIFT="$($KUBECTL get xakashworkload/demo-node-app -o jsonpath='{.status.leaseId}')"
step "mock view of the lease (memoryMi should now be 1024, same leaseId)"
mock_curl "/api/v1/compute/deployments/${LEASE_DRIFT}"; echo
echo "leaseId after drift = $LEASE_DRIFT (create leaseId was $LEASE_BEFORE)"
mock_curl /debug/state; echo

# ------------------------------------------------------------------ DELETE -> RELEASE
banner "DELETE XR -> lease RELEASED"
$KUBECTL delete xakashworkload/demo-node-app
echo "waiting for finalizer-driven release..."; sleep 15
step "mock state after release (activeLeaseIds empty, deleteCount=1)"
mock_curl /debug/state; echo
step "balance recovered (escrow returned)"
mock_curl /api/v1/compute/balances 2>/dev/null || true; echo

# ------------------------------------------------------------------ teardown
banner "DONE"
if [ "${KEEP_CLUSTER:-${SKIP_TEARDOWN:-0}}" = "1" ]; then
  echo "KEEP_CLUSTER set — leaving kind cluster '$CLUSTER' running."
else
  echo "Deleting kind cluster '$CLUSTER' (set KEEP_CLUSTER=1 to keep it)."
  kind delete cluster --name "$CLUSTER"
fi
