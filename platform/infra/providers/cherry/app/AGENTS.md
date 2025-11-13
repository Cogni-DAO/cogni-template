# app · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

SSH-based application deployment with monitoring and health validation for existing Cherry Servers VMs.

## Pointers

- [main.tf](main.tf): SSH deployment and health gate resources
- [files/Caddyfile.tmpl](files/Caddyfile.tmpl): Reverse proxy configuration template

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
- **Env/Config keys:** `TF_VAR_domain`, `TF_VAR_app_image`, `TF_VAR_host`, SSH keys
- **Files considered API:** `variables.tf`, `terraform.tfvars.example`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Deploy containerized apps via SSH, configure reverse proxy and monitoring, validate health
- This directory **does not**: Provision VMs or manage infrastructure lifecycle

## Usage

Minimal local commands:

```bash
tofu init
tofu apply -var="app_image=ghcr.io/repo:tag"
```

## Standards

- SSH deployment with file provisioner for configurations
- HTTP health gate required for all deployments
- Use Docker networks for service communication

## Dependencies

- **Internal:** `../../../files/scripts/wait-for-health.sh`, `../../../services/loki-promtail/promtail-config.yaml`
- **External:** SSH connectivity to target VM, Docker runtime

## Change Protocol

- Update this file when **deployment variables** or **health check URLs** change
- Bump **Last reviewed** date
- Coordinate with CI/CD scripts for variable passing

## Notes

- Requires existing VM from ../base/ with SSH access
- Uses templatefile() for dynamic Caddyfile generation
- Deploys 3 containers: app, caddy, promtail
