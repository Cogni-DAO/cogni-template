# bootstrap · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-12
- **Status:** draft

## Purpose

Development environment setup installers for one-time machine and repository configuration.

## Pointers

- [install/](install/): Individual installer scripts
- [README.md](README.md): Installation instructions and usage guide

## Boundaries

```json
{
  "layer": "platform",
  "may_import": ["external_package_managers"],
  "must_not_import": ["../../src/**"]
}
```

## Public Surface

- **Exports:** none
- **Routes (if any):** none
- **CLI (if any):** `install/*.sh` scripts
- **Env/Config keys:** none
- **Files considered API:** `install/*.sh`

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts (required if implementing):** none

## Responsibilities

- This directory **does**: Install development tools and configure project environment
- This directory **does not**: Handle runtime application dependencies or deployment

## Usage

Minimal local commands:

```bash
install/install-pnpm.sh    # Node.js development stack
install/install-tofu.sh    # Infrastructure tooling
install/install-docker.sh  # Container runtime
```

## Standards

- Individual focused scripts instead of monolithic installer
- Platform detection with fallback instructions
- Idempotent installations with existence checks

## Dependencies

- **Internal:** none
- **External:** Homebrew (macOS), system package managers

## Change Protocol

- Update this file when **installer interfaces** change
- Bump **Last reviewed** date
- Update README.md when new installers added

## Notes

- Scripts handle macOS via Homebrew with manual fallback instructions
- Broken apart from original monolithic bootstrap script
