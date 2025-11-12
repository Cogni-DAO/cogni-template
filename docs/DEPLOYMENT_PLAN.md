CI/CD plan v1 — updated paths (≈100 lines)

Goal

Build once. Push to GHCR. Deploy via OpenTofu to Cherry with cloud-init. Gate on HTTPS health.

Start on GitHub Actions. Keep swap to Jenkins trivial by isolating logic in scripts.

Repo layout

Dockerfile # app image with HEALTHCHECK

platform/ci/scripts/build.sh # builds image

platform/ci/scripts/push.sh # logs in to GHCR and pushes tag

platform/ci/scripts/deploy.sh # runs tofu init/plan/apply with vars

platform/infra/cherry/main.tf # server, user_data, wait gate

platform/infra/cherry/variables.tf # domain, app_image, tokens, etc.

platform/infra/cherry/cloud-init.tmpl.yaml # uses ${domain}, ${app_image}

platform/infra/cherry/terraform.tfvars.example# example inputs

.github/workflows/deploy.yaml # MVP CI (calls scripts)

platform/ci/jenkins/Jenkinsfile # future pipeline

platform/runbooks/DEPLOY.md # operator runbook

platform/bootstrap/ # one-time local tool installers (tofu, pnpm, reuse, docker)

Image health

Dockerfile includes curl and:

HEALTHCHECK CMD curl -fsS http://localhost:3000/api/v1/meta/health || exit 1

Terraform state and safety

Configure remote backend + locking (S3+DynamoDB or equivalent) under platform/infra/cherry/.

Add prevent_destroy or guard with var.allow_destroy.

Outputs: public_ip, domain, app_image, deploy_time.

Cloud-init essentials

Create web network.

Run app with ${app_image}, --restart=always.

Run caddy:2 on web, bind 80/443, mount Caddyfile.

Caddy reverse_proxy app:3000.

Use YAML argv form for docker run (no line breaks).

Health gate

null_resource.wait_http_ok curls https://${var.domain}/api/v1/meta/health up to 5 minutes.

Variables

variable "domain" (string) — no default; set per env.

variable "app_image" (string) — set by CI at deploy time.

Optional: cherry_auth_token, allow_destroy, environment.

Secrets

GHCR_PAT (push).

CHERRY_AUTH_TOKEN (Tofu provider).

App secrets managed separately.

GitHub Actions (MVP)

Trigger: push to production.

Steps:

Checkout.

Build image with tag ${{ github.ref_name }}-${{ github.sha[0:7] }} via platform/ci/scripts/build.sh.

Login + push to GHCR via platform/ci/scripts/push.sh.

Export TF_VAR_app_image to pushed tag; set TF_VAR_domain from repo/env.

Deploy via platform/ci/scripts/deploy.sh (OpenTofu).

Runner: ubuntu-latest with Docker CLI; run OpenTofu natively or in container.

Scripts (provider-agnostic; single source of truth)

platform/ci/scripts/build.sh: build linux/amd64; tag ${IMAGE}:${TAG}.

platform/ci/scripts/push.sh: docker login ghcr.io using GHCR_PAT; push.

platform/ci/scripts/deploy.sh:

export TF_VAR_app_image, TF_VAR_domain.

tofu -chdir=platform/infra/cherry init -upgrade

tofu -chdir=platform/infra/cherry plan

tofu -chdir=platform/infra/cherry apply -auto-approve (immutable path may use -replace).

Branching and tagging

Deploys only from production.

Tag: production-${short_sha}.

Optionally record digest in Terraform outputs.

Rollback

Keep last N tags.

Redeploy with previous TF_VAR_app_image; apply; health gate enforces correctness.

Observability (minimum)

docker ps and logs via SSH.

Caddy access logs on named volume.

Optional next: vector/promtail shipping.

Jenkins later (swap plan)

Reuse platform/ci/scripts/\* unchanged.

platform/ci/jenkins/Jenkinsfile mirrors GHA stages: Build → Push → Deploy.

Jenkins injects GHCR*PAT, CHERRY_AUTH_TOKEN, TF_VAR*\*.

Trigger on production branch.

Immutable vs mutable deploys

Default: immutable. VM replace for drift-free boot via cloud-init.

Future: mutable in-place docker pull && restart, then same health gate.

Runbook (platform/runbooks/DEPLOY.md)

Prereqs: secrets and remote state configured.

Checks: DNS A record, HTTPS 200, containers healthy.

Emergency: revert TF_VAR_app_image to prior tag; apply; or immutable rebuild with -replace.
