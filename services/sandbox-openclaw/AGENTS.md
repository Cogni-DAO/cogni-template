# services/sandbox-openclaw · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-07
- **Status:** draft

## Purpose

Docker image definition for running OpenClaw inside a network-isolated sandbox. Thin layer over `openclaw:local` — adds socat for the LLM socket bridge and our standard sandbox entrypoint.

## Pointers

- [OpenClaw Sandbox Spec](../../docs/OPENCLAW_SANDBOX_SPEC.md)
- [Sandbox Spec](../../docs/SANDBOXED_AGENTS.md)
- [Sandbox Runtime (reference)](../sandbox-runtime/)
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

- **Exports:** Docker image `cogni-sandbox-openclaw:latest`
- **Routes:** none
- **CLI:** `docker build -t cogni-sandbox-openclaw services/sandbox-openclaw`
- **Env/Config keys (runtime):** Same as `sandbox-runtime` — `LLM_PROXY_SOCKET`, `LLM_PROXY_PORT`, `OPENAI_API_BASE`, `RUN_ID`. Plus OpenClaw-specific: `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, `OPENCLAW_LOAD_SHELL_ENV`, `HOME`
- **Files considered API:** Dockerfile, entrypoint.sh

## Responsibilities

- This directory **does**: Layer socat + sandbox entrypoint onto the `openclaw:local` base image; reuse the same entrypoint as `sandbox-runtime` for socket bridge; enable OpenClaw to call LLMs via the proxy socket
- This directory **does not**: Build or maintain OpenClaw itself; contain secrets; manage container lifecycle; implement application logic

## Usage

```bash
# Build (requires openclaw:local base image)
docker build -t cogni-sandbox-openclaw services/sandbox-openclaw

# Run via diagnostic script
node scripts/diag-openclaw-sandbox.mjs
```

## Standards

- Base image: `openclaw:local` (must be built separately from OpenClaw repo)
- Entrypoint: identical to `sandbox-runtime/entrypoint.sh` (socat bridge + `bash -lc`)
- Non-root execution via adapter (`User: "1001:1001"`)
- `skipBootstrap: true` in OpenClaw config to avoid setup phase
- Socket mount at `/llm-sock` (same convention as sandbox-runtime)

## Dependencies

- **Internal:** none (image-only, no src/ imports)
- **External:** Docker, `openclaw:local` base image, socat (installed at build)

## Change Protocol

- Update this file when **Dockerfile** or **entrypoint.sh** changes
- Bump **Last reviewed** date
- Rebuild image and run diag script after changes

## Notes

- `entrypoint.sh` is copied from `sandbox-runtime/` (not symlinked) for build context isolation
- OpenClaw config is written to workspace by the host (adapter or diag script), not baked into image
- Image build requires `openclaw:local` which is ~4GB
