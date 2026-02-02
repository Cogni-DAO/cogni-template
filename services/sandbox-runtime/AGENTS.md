# services/sandbox-runtime · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-02-03
- **Status:** draft

## Purpose

Docker image definition for network-isolated sandbox containers. Provides minimal runtime environment for executing arbitrary commands without network access.

## Pointers

- [Sandbox Spec](../../docs/SANDBOXED_AGENTS.md)
- [Sandbox Adapter](../../src/adapters/server/sandbox/)

## Boundaries

```json
{
  "layer": "services",
  "may_import": ["services"],
  "must_not_import": ["app", "features", "core", "ports", "adapters"]
}
```

## Public Surface

- **Exports:** Docker image `cogni-sandbox-runtime:latest`
- **Routes:** none
- **CLI:** `docker build -t cogni-sandbox-runtime:latest services/sandbox-runtime`
- **Env/Config keys:** none
- **Files considered API:** Dockerfile

## Responsibilities

- This directory **does**: Define minimal container image; install git, jq, curl; create non-root sandboxer user; set bash entrypoint
- This directory **does not**: Implement application logic; manage container lifecycle; handle networking

## Usage

```bash
# Build image
docker build -t cogni-sandbox-runtime:latest services/sandbox-runtime

# Run isolated command
docker run --rm --network=none \
  -v /tmp/workspace:/workspace:rw \
  cogni-sandbox-runtime:latest \
  'echo hello from sandbox'
```

## Standards

- Base image: node:20-slim
- Non-root execution: user `sandboxer` (uid 1001)
- Entrypoint: `/bin/bash -lc` (runs command string)
- Minimal tooling: git, jq, curl only

## Dependencies

- **Internal:** none
- **External:** Docker, node:20-slim base image

## Change Protocol

- Update this file when **Dockerfile** or **base image** changes
- Bump **Last reviewed** date
- Rebuild and test image after changes

## Notes

- Image is built manually or via CI before running sandbox tests
- Container runs with `--network=none` enforced by adapter
- All capabilities dropped by adapter at runtime
