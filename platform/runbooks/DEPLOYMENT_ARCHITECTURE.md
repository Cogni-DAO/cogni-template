# Deployment Architecture Overview

## Goal

Build once. Push to GHCR. Deploy via OpenTofu to Cherry with SSH-based deployment. Gate on HTTPS health validation.

Split between immutable infrastructure (VM) and mutable application deployment.

## Architecture Split

### Base Infrastructure (`platform/infra/providers/cherry/base/`)

- **Purpose**: One-time VM provisioning with static OS bootstrap
- **Immutable**: VM configuration frozen after initial deployment
- **Contains**: Server creation, SSH keys, minimal cloud-init (Docker + tools only)

### App Deployment (`platform/infra/providers/cherry/app/`)

- **Purpose**: SSH-based container deployment and configuration
- **Mutable**: Updated on every deployment
- **Contains**: Container orchestration, Caddy configuration, health validation

## Component Overview

### Docker Image

- Built with `HEALTHCHECK CMD curl -fsS http://localhost:3000/api/v1/meta/health || exit 1`
- Tagged as `production-${short_sha}` for immutable deployments
- Pushed to GHCR with authentication

### Infrastructure Files

```
platform/infra/providers/cherry/
├── base/
│   ├── main.tf                    # VM creation with lifecycle ignore
│   ├── variables.tf               # VM sizing, SSH keys, region
│   ├── bootstrap.yaml             # Minimal cloud-init (Docker only)
│   └── terraform.tfvars.example
└── app/
    ├── main.tf                    # SSH deployment + health gate
    ├── variables.tf               # domain, app_image, SSH connection
    ├── files/Caddyfile.tmpl       # Reverse proxy template
    └── terraform.tfvars.example
```

### CI/CD Scripts (`platform/ci/scripts/`)

Provider-agnostic scripts callable from any CI system:

- **`build.sh`**: Build linux/amd64 image with standardized tagging
- **`push.sh`**: GHCR authentication and push
- **`deploy.sh`**: OpenTofu deployment with variable injection

### Deployment Flow

1. **Build Stage**

   ```bash
   platform/ci/scripts/build.sh
   # Builds: ${IMAGE}:production-${short_sha}
   ```

2. **Push Stage**

   ```bash
   platform/ci/scripts/push.sh
   # Authenticates with GHCR_PAT
   # Pushes tagged image
   ```

3. **Deploy Stage**
   ```bash
   platform/ci/scripts/deploy.sh
   # Sets: TF_VAR_app_image, TF_VAR_domain, TF_VAR_host, TF_VAR_ssh_private_key
   # Runs: tofu -chdir=platform/infra/providers/cherry/app apply -auto-approve
   ```

## SSH Deployment Process

The app deployment via SSH executes:

1. **File Transfer**: Upload rendered Caddyfile from template
2. **Container Updates**:
   ```bash
   docker network create web || true
   docker pull ${app_image}
   docker rm -f app caddy || true
   docker run -d --name app --network web --restart=always ${app_image}
   docker run -d --name caddy --network web --restart=always \
     -p 80:80 -p 443:443 \
     -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
     -v caddy_data:/data -v caddy_config:/config \
     caddy:2
   ```
3. **Health Validation**: Curl loop to `https://${domain}/api/v1/meta/health` (5min timeout)

## Required Secrets

### GitHub Secrets (for CI)

- `GHCR_PAT`: GitHub Container Registry personal access token
- `CHERRY_AUTH_TOKEN`: Cherry Servers API authentication
- `TF_VAR_domain`: Target deployment domain
- `TF_VAR_host`: Cherry VM IP address (from base deployment)
- `TF_VAR_ssh_private_key`: SSH private key in PEM format

### Environment Variables

- `TF_VAR_app_image`: Set at deployment time to specific image:tag
- SSH connection variables injected by CI scripts

## State Management

### Current: Local State

- Terraform state files in provider directories
- `.gitignore` excludes `terraform.tfstate*` files
- Manual state management during development

### Future: Remote Backend

- S3 + DynamoDB (or equivalent) for state storage and locking
- Configured in provider `backend` blocks
- State isolation between base/ and app/ deployments

## Branching and Deployment

- **Trigger**: Push to `production` branch only
- **Tagging**: `production-${short_sha}` for traceability
- **Rollback**: Redeploy with previous `TF_VAR_app_image` tag
- **Emergency**: Use `tofu apply -replace` for full VM recreation

## Observability

### Current (Minimal)

- Container status via `docker ps` over SSH
- Application logs via `docker logs app`
- Caddy access logs on persistent volume

### Future Enhancements

- Vector/Promtail log shipping
- Prometheus metrics collection
- Grafana dashboards for deployment monitoring

## Multi-Environment Support

### Current: Single Environment

- One base VM, one app deployment
- Environment-specific domains via `TF_VAR_domain`

### Future: Environment Separation

- Separate base/ deployments per environment
- Environment-specific variable files
- Branch-based deployment triggers

## Disaster Recovery

### Rollback Process

1. Identify previous working image tag
2. Set `TF_VAR_app_image` to previous tag
3. Run `tofu apply` - health gate validates success

### Complete Recovery

1. Redeploy base infrastructure if needed
2. Update DNS A records to new VM IP
3. Deploy latest known-good application image
4. Verify health checks and monitoring

## Jenkins Integration (Future)

The same `platform/ci/scripts/*` will be reused:

```groovy
// Jenkinsfile mirrors GitHub Actions structure
pipeline {
  stages {
    stage('Build') { sh 'platform/ci/scripts/build.sh' }
    stage('Push')  { sh 'platform/ci/scripts/push.sh' }
    stage('Deploy'){ sh 'platform/ci/scripts/deploy.sh' }
  }
}
```

Environment injection handled by Jenkins credential management.

## Security Considerations

- SSH private keys never logged or persisted
- Container registry authentication via short-lived tokens
- Health check endpoints provide minimal system information
- Infrastructure state isolation between immutable/mutable components
