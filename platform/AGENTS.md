# platform · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @cogni-dao/platform
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Platform-level tooling for infrastructure, CI/CD, development environment setup, and deployment automation.

## Pointers

- [DEPLOYMENT_PLAN.md](../docs/DEPLOYMENT_PLAN.md): Current deployment strategy
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md): System architecture overview

## Boundaries

```json
{
  "layer": "infra",
  "may_import": [],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Exports:** Infrastructure configurations, CI scripts, bootstrap installers
- **Routes (if any):** none
- **CLI (if any):** Bootstrap scripts in `bootstrap/install/`
- **Env/Config keys:** `CHERRY_AUTH_TOKEN`, `GHCR_DEPLOY_TOKEN`, `SONAR_TOKEN`, deployment vars
- **Files considered API:** `infra/providers/*/variables.tf`, CI scripts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Infrastructure provisioning, CI/CD automation, dev environment setup
- This directory **does not**: Application code, business logic, or runtime services

## Usage

Minimal local commands:

```bash
platform/bootstrap/install/install-pnpm.sh  # Dev setup
platform/bootstrap/install/install-tofu.sh  # Infrastructure tooling
```

## Standards

- Infrastructure as Code via OpenTofu
- Immutable VM provisioning + mutable app deployments
- Provider-agnostic CI scripts

## Dependencies

- **Internal:** none
- **External:** OpenTofu, Docker, SSH, Cherry Servers API

## Change Protocol

- Update this file when **directory structure** or **CI interfaces** change
- Bump **Last reviewed** date
- Update deployment docs when provider configs change

## Notes

- Split between immutable infrastructure (base/) and mutable deployments (app/)
- Keep .terraform directories in .gitignore
