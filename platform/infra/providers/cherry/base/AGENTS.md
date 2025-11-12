# base · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Immutable VM provisioning with static OS-level bootstrap for Cherry Servers infrastructure.

## Pointers

- [main.tf](main.tf): VM resource definitions
- [bootstrap.yaml](bootstrap.yaml): Static cloud-init configuration

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
- **Env/Config keys:** `CHERRY_AUTH_TOKEN`, SSH key paths
- **Files considered API:** `variables.tf`, `terraform.tfvars.example`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Create and configure Cherry Servers VMs with OS-level setup
- This directory **does not**: Deploy applications or handle container orchestration

## Usage

Minimal local commands:

```bash
tofu init
tofu plan
tofu apply
```

## Standards

- No application logic in cloud-init
- Use lifecycle ignore_changes for user_data stability
- Require SSH key configuration

## Dependencies

- **Internal:** none
- **External:** Cherry Servers API, SSH public keys

## Change Protocol

- Update this file when **VM configuration variables** change
- Bump **Last reviewed** date
- Coordinate with ../app/ for SSH connectivity requirements

## Notes

- Creates immutable VMs with Docker and basic tools only
- App deployment handled separately in ../app/ via SSH
