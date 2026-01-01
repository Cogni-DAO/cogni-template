# Bootstrap - Development Environment Setup

One-time development machine and repository setup.

## Quick Start

```bash
# From repository root
platform/bootstrap/setup.sh
```

This installs Node.js 20 (via Volta), pnpm, Docker Desktop, project dependencies, and git hooks. After installation, it runs pre-flight checks and offers to start the dev stack.

### Install All Tools

```bash
platform/bootstrap/setup.sh --all
```

Adds OpenTofu (infrastructure) and REUSE (license compliance) for fork owners deploying infrastructure.

## What Gets Installed

| Tool           | Default | --all | Purpose                                |
| -------------- | ------- | ----- | -------------------------------------- |
| Volta          | ✓       | ✓     | Node.js version manager (pins to 20.x) |
| Node.js 20     | ✓       | ✓     | JavaScript runtime                     |
| pnpm 9         | ✓       | ✓     | Package manager                        |
| Docker Desktop | ✓       | ✓     | Container runtime with compose v2      |
| OpenTofu       |         | ✓     | Infrastructure as Code                 |
| REUSE          |         | ✓     | License compliance checking            |

## Individual Installers

Located in `install/`:

```bash
platform/bootstrap/install/install-pnpm.sh     # Volta + Node 20 + pnpm
platform/bootstrap/install/install-docker.sh   # Docker Desktop + daemon check
platform/bootstrap/install/install-project.sh  # pnpm install + packages:build + git hooks
platform/bootstrap/install/install-tofu.sh     # OpenTofu
platform/bootstrap/install/install-reuse.sh    # REUSE tool
```

Additional scripts:

```bash
platform/bootstrap/simple-local-env-setup.sh  # Copy .env.local.example → .env.local
```

## Platform Support

- **macOS**: Full automated installation (Docker Desktop install prompts for system password)
- **Linux/Other**: Guided manual installation

## Pre-flight Checks

Before offering to start `dev:stack`, the setup script verifies:

- Node.js version is 20.x
- Docker daemon is running
- `docker compose` v2 is available

## Next Steps

```bash
cp .env.local.example .env.local  # Add your OpenRouter API key
pnpm dev:stack                    # Start full dev stack
pnpm check                        # Run validation checks
```
