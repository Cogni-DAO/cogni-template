# Cherry Servers Continuous Deployment

## Overview

Automated deployment workflow using GitHub Actions for mutable app updates on existing Cherry Servers infrastructure.

## Prerequisites

- Cherry VM deployed via [CHERRY_INITIAL_CONFIG.md](CHERRY_INITIAL_CONFIG.md)
- GitHub repository with GHCR access
- Required GitHub secrets configured

## GitHub Secrets

Configure the following secrets in your repository settings:

```bash
CHERRY_AUTH_TOKEN          # Cherry Servers API token
GHCR_PAT                  # GitHub Container Registry token
TF_VAR_domain             # Deployment domain (e.g., canary.cognidao.org)
TF_VAR_host               # Cherry VM IP address
TF_VAR_ssh_private_key    # SSH private key (PEM format)
```

## Deployment Workflow

### Trigger

Deployments trigger on push to `main` or `production` branch:

```yaml
on:
  push:
    branches: [main, production]
```

### Build → Push → Deploy Pipeline

1. **Build**: Create Docker image with tag `production-${short_sha}`
2. **Push**: Upload to GHCR with authentication
3. **Deploy**: SSH-based deployment via OpenTofu

## Manual Deployment

For manual deployments or testing:

### Step 1: Build and Push

```bash
# Set variables
export IMAGE_TAG="production-$(git rev-parse --short HEAD)"
export IMAGE_NAME="ghcr.io/your-org/your-repo"

# Build image
docker build -t "${IMAGE_NAME}:${IMAGE_TAG}" .

# Login and push
echo $GHCR_PAT | docker login ghcr.io -u your-username --password-stdin
docker push "${IMAGE_NAME}:${IMAGE_TAG}"
```

### Step 2: Deploy to Cherry

```bash
cd platform/infra/providers/cherry/app

# Set deployment variables
export TF_VAR_app_image="${IMAGE_NAME}:${IMAGE_TAG}"
export TF_VAR_domain="your-domain.com"
export TF_VAR_host="your-vm-ip"
export TF_VAR_ssh_private_key="$(cat ~/.ssh/your_private_key)"

# Deploy
tofu apply -auto-approve
```

## Health Validation

Deployment includes automatic health validation:

1. **Container Deployment**: SSH executes container updates
2. **Health Gate**: Curl loop tests `https://domain/api/v1/meta/health`
3. **Timeout**: 5 minutes maximum wait
4. **Failure Handling**: Deployment fails if health check fails

## Rollback Procedure

### Immediate Rollback

Deploy previous known-good image:

```bash
cd platform/infra/providers/cherry/app

# Set to previous image tag
export TF_VAR_app_image="ghcr.io/your-org/your-repo:previous-working-tag"

# Deploy rollback
tofu apply -auto-approve
```

### Find Previous Tags

List recent deployments:

```bash
# From GHCR
docker pull ghcr.io/your-org/your-repo:production-abc123

# From git history
git log --oneline -10 | grep -E "production-[a-f0-9]{7}"
```

## Monitoring and Logs

### Container Status

SSH to VM and check containers:

```bash
ssh root@your-vm-ip
docker ps
# Expected: app, caddy, promtail containers running
docker logs app
docker logs caddy
docker logs promtail
```

### Application Logs

```bash
# App logs
docker logs -f app

# Caddy access logs (JSON format)
docker exec caddy tail -f /data/logs/caddy/access.log

# Caddy error logs
docker exec caddy tail -f /data/logs/caddy/error.log

# Promtail status
curl http://vm-ip:9080/ready
curl http://vm-ip:9080/metrics
```

### Log Aggregation

Promtail automatically ships all container logs to Loki with labels:

- `{container="app"}` - Application logs
- `{container="caddy"}` - Reverse proxy logs
- `{container="promtail"}` - Log shipper logs

Access via Loki/Grafana dashboard or API queries.

## Troubleshooting

### Deployment Failures

**SSH Connection Issues**:

- Verify SSH private key format (PEM)
- Check VM IP address and connectivity
- Ensure root user access

**Container Pull Failures**:

- Verify image exists in GHCR
- Check image tag format
- Confirm GHCR authentication

**Health Check Failures**:

- Test app directly: `curl http://vm-ip:3000/api/v1/meta/health`
- Check container networking: `docker network ls`
- Verify Caddy configuration

### Performance Issues

**Slow Deployments**:

- Check image size and optimize layers
- Monitor SSH connection stability
- Consider parallel deployment strategies

**Resource Constraints**:

- Monitor VM CPU/memory: `htop`
- Check disk space: `df -h`
- Review container resource usage: `docker stats`

## CI/CD Script Integration

The deployment uses provider-agnostic scripts:

```bash
platform/ci/scripts/build.sh    # Build Docker image
platform/ci/scripts/push.sh     # Push to GHCR
platform/ci/scripts/deploy.sh   # Deploy via OpenTofu
```

These scripts can be called from any CI system (GitHub Actions, Jenkins, etc.).

### Deployment Artifacts

The `deploy.sh` script generates CI artifacts in `$RUNNER_TEMP/deploy-$GITHUB_RUN_ID/`:

- `plan.log` - Terraform plan output (no sensitive data)
- `apply.log` - Terraform apply output
- `deployment.json` - Deployment metadata and timestamps
- `tfplan` - Terraform plan file

Upload these as CI artifacts for audit trail and debugging.

## Emergency Procedures

### Complete Service Failure

1. **Check VM Status**: Verify Cherry VM is running
2. **Container Recovery**: Restart containers manually
3. **Rollback**: Deploy last known-good image
4. **DNS Failover**: Point DNS to backup infrastructure if available

### Data Recovery

- Container logs: Available via `docker logs`
- Caddy configs: Persisted in `/etc/caddy/`
- Volume data: Check `docker volume ls` for persistent data

## Monitoring Integration

Future enhancements:

- Prometheus metrics collection
- Log aggregation via Vector/Promtail
- Alert integration for deployment failures
- Performance monitoring dashboards
