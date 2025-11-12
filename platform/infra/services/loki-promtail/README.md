# Loki + Promtail Monitoring Stack

Minimal single-VM logging setup for container and proxy log aggregation.

## Components

- **Loki**: Log aggregation server (single-node config)
- **Promtail**: Log collector with Docker service discovery

## Promtail Features

- **Docker service discovery**: Auto-discovers all containers via `/var/run/docker.sock`
- **Smart labeling**: Extracts container name, image, compose service
- **JSON parsing**: Handles Docker's JSON log driver automatically
- **No hardcoded paths**: Uses dynamic discovery instead of static file paths

## Quick Start

### Self-hosted Loki (Optional)

```bash
docker run -d \
  --name loki \
  --network web \
  --restart always \
  -p 3100:3100 \
  -v loki_data:/loki \
  -v $(pwd)/loki-config.yaml:/etc/loki/local-config.yaml:ro \
  grafana/loki:2.9.0 \
  -config.file=/etc/loki/local-config.yaml
```

### Promtail Deployment

Deployed automatically via Cherry app Terraform:

```bash
docker run -d \
  --name promtail \
  --network web \
  --restart always \
  -v /etc/promtail/config.yaml:/etc/promtail/config.yaml:ro \
  -v /var/lib/promtail:/var/lib/promtail \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /var/lib/docker/containers:/var/lib/docker/containers:ro \
  grafana/promtail:2.9.0 \
  -config.file=/etc/promtail/config.yaml
```

## Log Query Examples

Filter by container:

```logql
{container="caddy"}
{container="app"}
```

Filter by log stream:

```logql
{stream="stdout"}
{stream="stderr"}
```

Combined filters:

```logql
{container="caddy", stream="stdout"} |= "error"
```

## Configuration

### Static Config

Use `promtail-config.yaml` as-is for simple deployments.

### Templated Config (Future)

For multi-environment or external Loki, rename to `promtail-config.tmpl.yaml` and template the Loki URL:

```yaml
clients:
  - url: ${loki_url}/loki/api/v1/push
```

## Integration

- **Deployed by**: `platform/infra/providers/cherry/app/main.tf`
- **Log sources**: All Docker containers (caddy, app, etc.)
- **Storage**: Host directory `/var/lib/promtail/positions.yaml`
- **Access**: Promtail HTTP endpoint on port 9080

## External Loki Services

For production, consider external Loki services:

- Grafana Cloud Logs
- AWS CloudWatch Logs with Loki proxy
- Self-hosted Loki cluster

Update `clients[0].url` and add authentication as needed.
