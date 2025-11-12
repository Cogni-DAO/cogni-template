# services · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Service-specific configurations for supporting infrastructure like LLM routing, observability, and databases.

## Pointers

- [litellm/](litellm/): LLM model routing and budget configurations
- [langfuse/](langfuse/): Observability and telemetry stack
- [postgres/](postgres/): Database service configurations

## Boundaries

```json
{
  "layer": "infrastructure",
  "may_import": ["../files", "docker_configs"],
  "must_not_import": ["../../../src/**"]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):** none
- **CLI (if any):** docker-compose commands
- **Env/Config keys:** Service-specific environment variables
- **Files considered API:** `*/docker-compose.yml`, `*/config.yaml`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Define supporting service configurations and compose files
- This directory **does not**: Handle application deployment or business logic

## Usage

Minimal local commands:

```bash
# Future implementation
docker-compose -f litellm/docker-compose.yml up
```

## Standards

- Use Docker Compose for service orchestration
- Include .env.example files for all services
- Document required environment variables

## Dependencies

- **Internal:** none
- **External:** Docker, service-specific dependencies

## Change Protocol

- Update this file when **service configurations** change
- Bump **Last reviewed** date
- Update documentation when new services added

## Notes

- Placeholder structure for supporting infrastructure services
- Will integrate with main application deployment pipeline
