# cherry · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Cherry Servers cloud provider configurations split between immutable VM provisioning and mutable app deployments.

## Pointers

- [base/](base/): VM provisioning and static bootstrap
- [app/](app/): SSH-based app deployment and health gates

## Boundaries

```json
{
  "layer": "infrastructure",
  "may_import": ["../../files", "terraform_modules"],
  "must_not_import": ["../../../../src/**"]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** `CHERRY_AUTH_TOKEN`
- **Files considered API:** `base/variables.tf`, `app/variables.tf`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define Cherry Servers infrastructure and deployment configurations
- This directory **does not**: Contain application logic or business rules

## Usage

Minimal local commands:

```bash
cd base && tofu init && tofu plan
cd app && tofu apply
```

## Standards

- Split between base/ (immutable VM) and app/ (mutable deployment)
- Use SSH for app deployments, not cloud-init
- Health gates required for all deployments

## Dependencies

- **Internal:** `../../files/scripts/`, Caddyfile templates
- **External:** Cherry Servers API, OpenTofu

## Change Protocol

- Update this file when **variable schemas** change
- Bump **Last reviewed** date
- Update terraform.tfvars.example when new variables added

## Notes

- Base creates VM with static OS bootstrap only
- App handles container deployment over SSH with health validation
