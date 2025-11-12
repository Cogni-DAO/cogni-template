# files · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Shared templates and utility scripts for infrastructure deployments across all providers.

## Pointers

- [scripts/](scripts/): Utility scripts for deployment automation
- [Caddyfile.tmpl](../providers/cherry/app/files/Caddyfile.tmpl): Reverse proxy template

## Boundaries

```json
{
  "layer": "infra",
  "may_import": [],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Exports:** Shell scripts, configuration templates
- **Routes (if any):** none
- **CLI (if any):** Direct script execution
- **Env/Config keys:** none
- **Files considered API:** `scripts/*.sh`, `*.tmpl`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Provide reusable deployment utilities and configuration templates
- This directory **does not**: Contain provider-specific configurations

## Usage

Minimal local commands:

```bash
scripts/wait-for-health.sh https://example.com/health
scripts/ensure-docker-volumes.sh
```

## Standards

- All scripts must be executable and have error handling
- Use templatefile() syntax for configuration templates
- Include usage documentation in script headers

## Dependencies

- **Internal:** none
- **External:** curl, docker, bash

## Change Protocol

- Update this file when **shared script interfaces** change
- Bump **Last reviewed** date
- Test scripts with all dependent providers

## Notes

- Scripts designed for remote execution via SSH provisioners
- Templates use ${variable} syntax for Terraform templatefile()
