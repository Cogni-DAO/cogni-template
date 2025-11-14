# base · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Immutable VM provisioning with SSH deploy key management and Docker/Docker Compose installation for Cherry Servers infrastructure.

## Pointers

- [DEPLOY.md](../../../runbooks/DEPLOY.md): Step-by-step setup guide
- [DEPLOYMENT_ARCHITECTURE.md](../../../runbooks/DEPLOYMENT_ARCHITECTURE.md): Architecture overview

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

- This directory **does**: VM provisioning, SSH deploy key installation, Docker/Docker Compose bootstrap, VM host output to GitHub secrets
- This directory **does not**: Application deployment (handled by SSH + Docker Compose from GitHub Actions)

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
- VM changes affect SSH deployment workflows

## Notes

- OpenTofu-only layer (no application concerns)
- Outputs VM host IP to GitHub Environment Secrets for SSH deployment
- See runbooks/ for setup and architecture details
