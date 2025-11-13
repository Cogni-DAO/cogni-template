# Cherry Servers Initial Configuration

## Prerequisites

- Cherry Servers account and API token
- SSH key pair generated and available locally
- OpenTofu installed (`platform/bootstrap/install/install-tofu.sh`)
- DNS A record pointing to target domain (will be configured after VM creation)

## Environment Variables

Export required credentials:

```bash
export CHERRY_AUTH_TOKEN="your_cherry_api_token"
export TF_VAR_project_id="your_cherry_project_id"
```

## Step 1: Configure Base Infrastructure

Navigate to base configuration:

```bash
cd platform/infra/providers/cherry/base
```

Copy and customize variables:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
project_id = "12345"
region = "eu_nord_1"
hostname = "cogni-canary"
public_key_path = "~/.ssh/your_key.pub"
```

## Step 2: Initialize and Deploy Base

Initialize Terraform:

```bash
tofu init
```

Review planned changes:

```bash
tofu plan
```

Deploy VM (one-time):

```bash
tofu apply
```

**Expected output**: VM IP address, SSH connectivity confirmed

## Step 3: Configure DNS

Point your domain's A record to the VM IP address output from Step 2.

Wait for DNS propagation (check with `dig your-domain.com`).

## Step 4: Configure App Deployment

Navigate to app configuration:

```bash
cd ../app
```

Copy and customize variables:

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:

```hcl
domain = "your-domain.com"
app_image = "ghcr.io/your-org/your-repo:latest"
host = "VM_IP_FROM_STEP_2"
ssh_user = "root"
ssh_private_key = "$(cat ~/.ssh/your_private_key)"
```

## Step 5: Test App Deployment

Initialize app deployment:

```bash
tofu init
```

Deploy application:

```bash
tofu plan
tofu apply
```

**Expected output**: Health check passes, containers running

## Step 6: Verify Deployment

Test endpoints:

```bash
curl -I https://your-domain.com/api/v1/meta/health
# Expected: HTTP/2 200

docker ps
# Expected: app and caddy containers running
```

## Troubleshooting

### VM Creation Issues

- Check Cherry Servers API token and project ID
- Verify SSH public key format and path
- Ensure region availability

### DNS Issues

- Confirm A record points to correct IP
- Wait for DNS propagation (up to 24 hours)
- Test with `dig your-domain.com`

### App Deployment Issues

- Verify SSH connectivity: `ssh root@VM_IP`
- Check container logs: `docker logs app`
- Verify Caddy configuration: `docker exec caddy caddy config`

### Health Check Failures

- Check app container status: `docker ps`
- Verify internal network: `docker network ls`
- Test direct app connection: `curl http://VM_IP:3000/api/v1/meta/health`

## Outputs

After successful deployment:

- VM running with static configuration
- App deployed via SSH with health validation
- HTTPS endpoint accessible at configured domain

## Next Steps

- Configure CI/CD for automated deployments
- Set up monitoring and log aggregation
- Configure backup and disaster recovery
