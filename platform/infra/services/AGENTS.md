# services · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-16
- **Status:** draft

## Purpose

Service-specific configurations for supporting infrastructure like LLM routing, observability, and databases.

## Pointers

- [runtime/](runtime/): Production and development Docker Compose stacks
- [loki-promtail/](loki-promtail/): Log aggregation and monitoring stack
- [litellm/](litellm/): LLM model routing and budget configurations
- [langfuse/](langfuse/): Observability and telemetry stack
- [postgres/](postgres/): Database service configurations

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
- **CLI (if any):** docker-compose commands
- **Env/Config keys:** Service-specific environment variables
- **Files considered API:** `runtime/docker-compose.yml`, `runtime/docker-compose.dev.yml`, `*/config.yaml`

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
# Development stack (DB + LiteLLM for local dev)
docker-compose -f runtime/docker-compose.dev.yml up -d

# Production stack (full application stack)
docker-compose -f runtime/docker-compose.yml up -d
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
