# loki-promtail · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Minimal logging stack configuration for container and proxy log aggregation using Docker service discovery.

## Pointers

- [promtail-config.yaml](promtail-config.yaml): Docker service discovery configuration
- [loki-config.yaml](loki-config.yaml): Single-node Loki server configuration

## Boundaries

```json
{
  "layer": "infra",
  "may_import": [],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** none
- **Files considered API:** `promtail-config.yaml`, `loki-config.yaml`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define log aggregation configurations for Docker containers
- This directory **does not**: Handle application logging or log processing logic

## Usage

Minimal local commands:

```bash
# Deployed automatically via Cherry app Terraform
# Access Promtail metrics: curl http://vm-ip:9080/metrics
```

## Standards

- Use Docker service discovery instead of hardcoded file paths
- Auto-label containers with name, image, compose service
- JSON log parsing via Docker pipeline stage
- Store positions file on host for persistence

## Dependencies

- **Internal:** Deployed via `../../providers/cherry/app/main.tf`
- **External:** Docker runtime, Grafana Promtail/Loki images

## Change Protocol

- Update this file when **configuration schemas** change
- Bump **Last reviewed** date
- Test configuration changes with actual deployment

## Notes

- Promtail discovers all containers via Docker socket automatically
- Loki URL can be templated for multi-environment deployments
- Positions file persisted to `/var/lib/promtail/` on host
