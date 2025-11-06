# infra · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-06
- **Status:** draft

## Purpose

Infrastructure as Code including Docker Compose, LiteLLM config, Langfuse, and Terraform/OpenTofu for Akash deployment.

## Pointers

- [Root AGENTS.md](../AGENTS.md)
- [Architecture](../docs/ARCHITECTURE.md)

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
- **CLI (if any):** docker-compose, terraform/tofu commands
- **Env/Config keys:** Infrastructure deployment variables
- **Files considered API:** none

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
docker-compose up
terraform plan
```

## Standards

- Reproducible infrastructure
- Crypto-paid services only

## Dependencies

- **Internal:** none
- **External:** Docker, Terraform/OpenTofu, cloud providers

## Change Protocol

- Update this file when **Exports**, **Routes**, or **Env/Config** change
- Bump **Last reviewed** date
- Update ESLint boundary rules if **Boundaries** changed
- Ensure boundary lint + (if Ports) **contract tests** pass

## Notes

- Akash deployment for production, local docker-compose for development
