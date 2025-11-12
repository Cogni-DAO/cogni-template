# infra · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Infrastructure as Code configurations for cloud providers, services, and deployment stacks using OpenTofu.

## Pointers

- [providers/cherry/](providers/cherry/): Cherry Servers deployment configs
- [files/](files/): Shared templates and utility scripts

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
- **CLI (if any):** tofu commands in provider directories
- **Env/Config keys:** `CHERRY_AUTH_TOKEN`, provider auth tokens, deployment variables
- **Files considered API:** `providers/*/variables.tf`, `files/*.tmpl`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define deployments, service configurations, infrastructure provisioning
- This directory **does not**: Contain application logic, business rules, or UI components

## Usage

Minimal local commands:

```bash
cd providers/cherry/base && tofu plan
cd providers/cherry/app && tofu apply
```

## Standards

- Split providers into base (VM) and app (deployment) configurations
- Use templatefile() for dynamic configurations
- All providers require example tfvars files

## Dependencies

- **Internal:** Shared files/, templates, scripts
- **External:** OpenTofu, cloud provider APIs

## Change Protocol

- Update this file when **provider interfaces** or **template formats** change
- Bump **Last reviewed** date
- Update example tfvars when variable schemas change

## Notes

- Providers split between immutable (base/) and mutable (app/) resources
- Shared artifacts in files/ directory for reuse
