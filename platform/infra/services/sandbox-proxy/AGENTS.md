# sandbox-proxy · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-07
- **Status:** draft

## Purpose

Nginx config template for the per-run LLM proxy container. Injects authentication, billing identity, and observability headers into requests forwarded to LiteLLM. No bespoke code — config-only proxy.

## Pointers

- [Sandbox Spec](../../../../docs/SANDBOXED_AGENTS.md)
- [LlmProxyManager](../../../../src/adapters/server/sandbox/llm-proxy-manager.ts) (generates config from template)
- [Billing Spec](../../../../docs/EXTERNAL_EXECUTOR_BILLING.md)

## Boundaries

```json
{
  "layer": "infra",
  "may_import": [],
  "must_not_import": ["app", "features", "core", "ports", "adapters"]
}
```

## Public Surface

- **Exports:** `nginx.conf.template` (consumed by `LlmProxyManager.generateConfig()`)
- **Routes:** none
- **CLI:** none
- **Env/Config keys (template vars):** `SOCKET_PATH`, `LITELLM_MASTER_KEY`, `BILLING_ACCOUNT_ID`, `LITELLM_METADATA_JSON`, `RUN_ID`, `ATTEMPT`, `LITELLM_HOST`, `ACCESS_LOG_PATH`
- **Files considered API:** nginx.conf.template

## Responsibilities

- This directory **does**: Define nginx listen-on-socket config; inject Authorization header (LITELLM_MASTER_KEY); inject x-litellm-end-user-id (billingAccountId); inject x-litellm-metadata (run correlation + Langfuse); overwrite client-sent identity headers; log audit trail (runId, status, model, litellm_call_id); serve /health endpoint
- This directory **does not**: Run as a standalone service; contain secrets at rest; implement application logic; count tokens

## Usage

Template is consumed programmatically by `LlmProxyManager.generateConfig()`. Not used directly.

## Standards

- Template variables substituted at runtime by `LlmProxyManager.generateConfig()` (not envsubst)
- Proxy container runs `nginx:alpine` on `sandbox-internal` Docker network
- Socket path inside container: `/llm-sock/llm.sock`
- All `x-litellm-*` headers overwritten unconditionally (sandbox cannot spoof identity)

## Dependencies

- **Internal:** consumed by `src/adapters/server/sandbox/llm-proxy-manager.ts`
- **External:** nginx:alpine Docker image, LiteLLM upstream

## Change Protocol

- Update this file when template variables or header injection logic changes
- Bump **Last reviewed** date
- Run `pnpm test:stack:dev -- sandbox-llm` after changes

## Notes

- See README.md in this directory for architecture diagram and header details
