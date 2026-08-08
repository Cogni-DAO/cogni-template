---
name: deploy-node
description: "Deploy Cogni operator + node apps to k3s via Argo CD. Covers fresh VM provisioning (Cherry Servers + OpenTofu), k3s + Argo CD bootstrap verification, DNS setup, image promotion, and health checks. Use this skill when deploying to staging/production, provisioning new VMs, debugging Argo CD sync issues, promoting images, or verifying deployment health. Also triggers for: 'deploy to staging', 'provision a VM', 'check deployment status', 'promote image', 'Argo CD sync'."
---

# Deploy Node — k3s + Argo CD Operations

You are a deployment operations agent for the Cogni multi-node platform. Your job: get apps running on k3s via Argo CD, from bare metal to healthy pods.

## References (read these — they own the details)

- [CD Pipeline E2E Spec](../../../docs/spec/cd-pipeline-e2e.md) — full architecture, gap analysis, decisions
- [Infrastructure Setup Runbook](../../../docs/runbooks/INFRASTRUCTURE_SETUP.md) — VM provisioning steps
- [provision-test-vm.sh](../../../scripts/setup/provision-test-vm.sh) — one-command test provisioning
- [Deployment Architecture](../../../docs/runbooks/DEPLOYMENT_ARCHITECTURE.md) — Compose + k3s dual-runtime

## Architecture (30-second version)

Single VM per environment. Two runtimes coexist:

| Runtime            | What it runs                              | Deploy method                      |
| ------------------ | ----------------------------------------- | ---------------------------------- |
| **Docker Compose** | Postgres, Temporal, LiteLLM, Redis, Caddy | `deploy.sh` via SSH                |
| **k3s + Argo CD**  | Operator, Poly, Resy, Scheduler-Worker    | GitOps: overlay change → auto-sync |

Adding a new node = adding `infra/catalog/{name}.yaml`. Argo CD's ApplicationSet auto-generates an Application from it.

## Pre-flight

```bash
# Required tools
tofu --version        # OpenTofu for VM provisioning
kubectl version       # For manifest validation
age-keygen --version  # SOPS key generation
ssh-keygen            # SSH key generation

# Required credentials (check .env.deployments or .env.local)
grep CHERRY_AUTH_TOKEN .env.deployments   # Cherry Servers API
grep CLOUDFLARE .env.local                # DNS management
```

## Operations

### 1. Provision a Fresh VM

For testing or new environments. Generates ephemeral keys, provisions via OpenTofu.

```bash
# One-command (prompts for project ID):
CHERRY_AUTH_TOKEN=<token> bash scripts/setup/provision-test-vm.sh

# Or with all vars:
CHERRY_AUTH_TOKEN=<token> CHERRY_PROJECT_ID=<id> bash scripts/setup/provision-test-vm.sh
```

Saves SSH key + VM IP to `.local/` (gitignored). The bootstrap installs Docker + k3s + Argo CD via cloud-init (~5 min).

**Available Cherry VPS plans** (max 6GB):

| Slug                   | Specs              | Use case                      |
| ---------------------- | ------------------ | ----------------------------- |
| `B1-4-4gb-80s-shared`  | 4 vCPU, 4GB, 80GB  | Dev/test (tight for k3s+Argo) |
| `B1-6-6gb-100s-shared` | 6 vCPU, 6GB, 100GB | Staging/production            |

### 2. Verify Bootstrap

After provisioning, cloud-init runs the bootstrap script. Verify it completed:

```bash
VM_IP=$(cat .local/test-vm-ip)
SSH_KEY=".local/test-vm-key"

# Check bootstrap marker
ssh -i $SSH_KEY root@$VM_IP 'cat /var/lib/cogni/bootstrap.ok'

# If bootstrap.fail exists, check logs:
ssh -i $SSH_KEY root@$VM_IP 'cat /var/lib/cogni/bootstrap.fail; tail -100 /var/log/cogni-bootstrap.log'

# Verify components
ssh -i $SSH_KEY root@$VM_IP 'docker version && kubectl get nodes && kubectl -n argocd get pods'
```

**Known issue:** `kubectl wait --for=condition=Ready node` can fail if k3s hasn't registered the node yet. If bootstrap fails at this step, SSH in and run the remaining steps manually — k3s is likely running fine, it just needed a few more seconds.

### 3. Setup DNS

Create A records for each node app pointing to the VM IP:

```bash
source .env.local && export CLOUDFLARE_API_TOKEN CLOUDFLARE_ZONE_ID
VM_IP=$(cat .local/test-vm-ip)

# Using dns-ops package:
npx tsx packages/dns-ops/scripts/create-node.ts <slug>

# Or directly via curl for throwaway test records:
for sub in test poly-test resy-test; do
  curl -s -X POST \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
    -d "{\"type\":\"A\",\"name\":\"${sub}\",\"content\":\"${VM_IP}\",\"ttl\":300,\"proxied\":false}"
done

# Verify:
dig +short test.cognidao.org @1.1.1.1
```

### 4. Verify Argo CD ApplicationSets

Argo CD reads `infra/catalog/*.yaml` and generates one Application per entry:

```bash
ssh -i $SSH_KEY root@$VM_IP 'kubectl -n argocd get applicationsets'
# Should show: cogni-staging, cogni-production

ssh -i $SSH_KEY root@$VM_IP 'kubectl -n argocd get applications'
# Should show: staging-operator, staging-poly, staging-resy, staging-scheduler-worker
```

**If 0 applications generated:** The ApplicationSet watches `main`. If catalog files only exist on a feature branch, patch the ApplicationSet:

```bash
ssh -i $SSH_KEY root@$VM_IP "kubectl -n argocd get applicationset cogni-staging -o jsonpath='{.spec.generators[0].git.revision}'"
# Check what branch it's watching
```

### 5. Promote an Image

After CI builds and pushes an image to GHCR:

```bash
# Promote a single app:
scripts/ci/promote-k8s-image.sh \
  --app operator \
  --digest ghcr.io/cogni-dao/cogni-template@sha256:abc123...

# With migrator:
scripts/ci/promote-k8s-image.sh \
  --app operator \
  --digest ghcr.io/cogni-dao/cogni-template@sha256:abc123... \
  --migrator-digest ghcr.io/cogni-dao/cogni-template@sha256:def456...
```

This updates the Kustomize overlay. Argo CD auto-syncs within 3 minutes.

### 6. Health Verification (Full Deployment Validation)

Run ALL checks. /readyz 200 is necessary but NOT sufficient — apps can pass health probes while crashing for users.

```bash
# ── Tier 1: Infrastructure (must pass) ──────────────────────────
# Pod status — all pods 1/1 Running, no CrashLoopBackOff
ssh -i $SSH_KEY root@$VM_IP 'kubectl -n cogni-staging get pods'

# Argo sync — all apps Synced + Healthy
ssh -i $SSH_KEY root@$VM_IP 'kubectl -n argocd get applications -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status'

# ── Tier 2: Health probes ───────────────────────────────────────
for url in https://test.cognidao.org https://poly-test.cognidao.org https://resy-test.cognidao.org; do
  echo "$url/livez  → $(curl -sk -o /dev/null -w '%{http_code}' $url/livez)"
  echo "$url/readyz → $(curl -sk -o /dev/null -w '%{http_code}' $url/readyz)"
done

# ── Tier 3: App actually works (catches client-side crashes) ────
# Homepage returns HTML without error div
for url in https://test.cognidao.org https://poly-test.cognidao.org https://resy-test.cognidao.org; do
  BODY=$(curl -sk "$url" 2>/dev/null | head -100)
  if echo "$BODY" | grep -q 'Application error'; then
    echo "❌ $url — client-side crash detected"
  else
    echo "✅ $url — homepage renders"
  fi
done

# ── Tier 4: Data flowing (observability) ────────────────────────
# Check Grafana Loki for recent logs from k8s pods
# TODO: Use Grafana MCP to query:
#   {namespace="cogni-staging"} |= "level" | json | level="info" | last 5m

# Check Temporal for system AI runs
# TODO: ssh to VM, temporal workflow list --namespace cogni-preview

# ── Tier 5: Agent connectivity (a2a) ───────────────────────────
# TODO: POST to system agent endpoint, verify response
# TODO: Verify billing callback pipeline (LiteLLM → node → charge_receipt)
```

**Known issue (bug.0276):** Apps may pass livez/readyz but crash client-side due to missing COGNI_REPO_ROOT (no git-sync sidecar in k8s). The COGNI_REPO_PATH optional fix (#708) works for the OLD image but the NEW CI-built image may have stricter validation.

### 7. Rollback

```bash
# Revert the overlay commit → Argo syncs previous digest
git revert <overlay-commit-sha>
git push

# Or manually set a known-good digest:
scripts/ci/promote-k8s-image.sh --app operator --digest ghcr.io/cogni-dao/cogni-template@sha256:<known-good>
```

### 8. Destroy Test VM

```bash
cd infra/provision/cherry/base
export CHERRY_AUTH_TOKEN=$(grep '^CHERRY_AUTH_TOKEN=' .env.deployments | cut -d= -f2-)
tofu workspace select test
tofu destroy -var-file=terraform.test.tfvars

# Clean up DNS records too (via Cloudflare dashboard or API)
# Clean up orphaned SSH keys in Cherry portal
```

## Validate Manifests Locally

Before deploying, verify all overlays render:

```bash
bash scripts/ci/check-gitops-manifests.sh    # All 10 overlays render
bash scripts/ci/check-gitops-service-coverage.sh  # All catalog entries covered
```

## Key Files

| File                                           | Purpose                                             |
| ---------------------------------------------- | --------------------------------------------------- |
| `infra/catalog/*.yaml`                         | App/node inventory (drives ApplicationSet)          |
| `infra/k8s/base/node-app/`                     | Shared Kustomize base for operator/poly/resy        |
| `infra/k8s/overlays/{env}/{app}/`              | Per-app, per-env patches (image digests, NodePorts) |
| `infra/k8s/argocd/staging-applicationset.yaml` | Git file generator for staging                      |
| `infra/k8s/secrets/{env}/{app}.enc.yaml`       | SOPS-encrypted k8s secrets                          |
| `infra/provision/cherry/base/bootstrap.yaml`   | Cloud-init: Docker + k3s + Argo CD                  |
| `scripts/ci/promote-k8s-image.sh`              | Update overlay with new image digest                |
| `scripts/setup/provision-test-vm.sh`           | One-command test VM provisioning                    |

## Troubleshooting

| Symptom                              | Cause                                    | Fix                                                                                           |
| ------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `generated 0 applications`           | ApplicationSet watches wrong branch      | Patch revision to match branch with catalog files                                             |
| `kubectl wait` fails in bootstrap    | k3s node not registered yet              | SSH in, wait 10s, run remaining bootstrap steps manually                                      |
| `ImagePullBackOff`                   | GHCR auth missing or image doesn't exist | Check k3s registries.yaml; images are placeholders until CI builds real ones                  |
| `ErrImagePull` on dex-server         | ghcr.io/dexidp needs auth                | Non-blocking — dex is for SSO, not required for basic Argo operation                          |
| Overlay renders but pods don't start | Missing k8s Secret                       | Encrypt secrets with SOPS: `sops --encrypt --in-place infra/k8s/secrets/{env}/{app}.enc.yaml` |
| DNS resolves but HTTPS fails         | Caddy not configured for subdomain       | Add subdomain block to `infra/compose/edge/configs/Caddyfile.tmpl`                            |

## NodePort Allocation

| App      | NodePort | Used by                              |
| -------- | -------- | ------------------------------------ |
| operator | 30000    | Caddy reverse proxy, LiteLLM billing |
| poly     | 30100    | Caddy reverse proxy, LiteLLM billing |
| resy     | 30300    | Caddy reverse proxy, LiteLLM billing |

## Deployment Receipt

After every deploy operation (provision, promote, verify), produce a **Deployment Status Report**
for the user. This is the single most important output — the user should glance at it and know
exactly what's running, what's broken, and what it costs.

### How to gather the data

```bash
VM_IP=$(cat .local/test-vm-ip 2>/dev/null || echo "unknown")
SSH_KEY=".local/test-vm-key"
CHERRY_TOKEN=$(grep '^CHERRY_AUTH_TOKEN=' .env.deployments 2>/dev/null | cut -d= -f2-)

# 1. Component status (SSH to VM)
ssh -i $SSH_KEY root@$VM_IP 'kubectl -n argocd get applications -o json' 2>/dev/null

# 2. URL health (curl each endpoint)
for url in https://test.cognidao.org/livez https://poly-test.cognidao.org/livez; do
  curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url"
done

# 3. Cherry billing API
curl -s -H "Authorization: Bearer $CHERRY_TOKEN" \
  "https://api.cherryservers.com/v1/projects/<project_id>/servers" | \
  python3 -c "import json,sys; [print(f'{s[\"hostname\"]}: {s[\"pricing\"][\"unit_price\"]} EUR/hr') for s in json.load(sys.stdin)]"
```

### Report format

Always present the report using this exact template. Use color indicators:

- `[UP]` = running and healthy (green in markdown: **UP**)
- `[DOWN]` = not running or unhealthy
- `[DEGRADED]` = running but not fully healthy
- `[PENDING]` = waiting for sync/image/dependency

```
## Deployment Status Report

**Environment:** staging | **VM:** 84.32.109.249 | **Plan:** B1-6-6gb-100s-shared
**Timestamp:** 2026-04-02T22:35:00Z | **Deploy duration:** 4m 32s

### Components

| Component            | Status      | Sync     | Image                          |
|---------------------|-------------|----------|--------------------------------|
| operator            | [UP]        | Synced   | @sha256:abc123...              |
| poly                | [UP]        | Synced   | @sha256:def456...              |
| resy                | [PENDING]   | OutOfSync| placeholder                    |
| scheduler-worker    | [UP]        | Synced   | @sha256:789abc...              |
| caddy (edge)        | [UP]        | —        | caddy:2                        |
| postgres            | [UP]        | —        | postgres:15                    |
| temporal            | [UP]        | —        | temporalio/auto-setup:1.29.1   |
| litellm             | [UP]        | —        | cogni-litellm:latest           |

### URLs

| URL                              | Status | Response | Latency |
|----------------------------------|--------|----------|---------|
| https://test.cognidao.org/livez  | [UP]   | 200 OK   | 142ms   |
| https://poly-test.cognidao.org   | [DOWN] | timeout  | —       |
| https://resy-test.cognidao.org   | [DOWN] | timeout  | —       |

### Cost

| Resource            | Rate         | Running since      | Accrued   |
|--------------------|-------------|--------------------|-----------|
| Cherry VM (6GB)    | €0.07/hr    | 2026-04-02 22:00   | €0.13     |
| **Projected /day** | **€1.68**   |                    |           |
| **Projected /mo**  | **€51.10**  |                    |           |

### DNS Records (Cloudflare)

| Record                     | Type | Value          | TTL  |
|---------------------------|------|----------------|------|
| test.cognidao.org          | A    | 84.32.109.249  | 300  |
| poly-test.cognidao.org     | A    | 84.32.109.249  | 300  |
| resy-test.cognidao.org     | A    | 84.32.109.249  | 300  |
```

### When to produce this report

- After `provision-test-vm.sh` completes
- After `promote-k8s-image.sh` runs
- After any `verify` or `health` command
- When the user asks "what's the status" or "how's the deploy"
- Before destroying a VM (final cost summary)

The report replaces verbose log output. The user should never have to SSH into the VM
to understand the current state — this report tells them everything.
