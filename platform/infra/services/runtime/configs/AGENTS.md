# configs · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-12-06
- **Status:** draft

## Purpose

Service configuration files for runtime stack services (LiteLLM proxy, Grafana Alloy). Defines model routing with metadata, log collection pipelines, and datasource provisioning.

## Pointers

- [Parent: runtime](../AGENTS.md)
- [LiteLLM Provider Docs](https://docs.litellm.ai/docs/providers/openrouter)
- [Model Selection](../../../../../docs/MODEL_SELECTION.md)

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
- **CLI (if any):** none
- **Env/Config keys:** `LITELLM_MASTER_KEY`, `OPENROUTER_API_KEY`, `LITELLM_DATABASE_URL`, `GRAFANA_CLOUD_LOKI_URL`, `GRAFANA_CLOUD_LOKI_USER`, `GRAFANA_CLOUD_LOKI_API_KEY`, `METRICS_TOKEN`, `PROMETHEUS_REMOTE_WRITE_URL`, `PROMETHEUS_USERNAME`, `PROMETHEUS_PASSWORD`
- **Files considered API:** litellm.config.yaml, alloy-config.alloy, alloy-config.metrics.alloy, grafana-provisioning/datasources/loki.yaml

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: configure LiteLLM model aliases with metadata, define Alloy log scraping and forwarding, provision Grafana Loki datasources
- This directory **does not**: contain executable code or deployment automation

## Usage

Mounted as volumes in docker-compose.yml.

## Standards

**LiteLLM Config** (`litellm.config.yaml`):

- Each `model_list` entry requires `model_name` (unique alias)
- `model_info` metadata required for UI: `display_name`, `is_free`, `provider_key`
- Provider routing via `litellm_params.model` (OpenRouter format)
- Env substitution: `os.environ/VAR_NAME`

**Alloy Config** (env-specific):

- `alloy-config.alloy` - Logs only (local dev); scrapes Docker containers → Loki
- `alloy-config.metrics.alloy` - Logs + metrics (preview/prod); adds prometheus.scrape → Mimir
- docker-compose.dev.yml mounts `alloy-config.alloy`; docker-compose.yml mounts `alloy-config.metrics.alloy`
- Treating "metrics config without creds" as deployment misconfig (not tolerated)

## Dependencies

- **Internal:** none
- **External:** LiteLLM proxy service, Grafana Alloy, Grafana Cloud

## Change Protocol

- Update this file when config structure changes
- Bump **Last reviewed** date
- Update app model cache if LiteLLM API contract changes

## Notes

- litellm.config.yaml is single source of truth for model metadata
- App fetches from `/model/info` endpoint to read `model_info` fields
- Adding models: update config + restart LiteLLM, app cache refreshes within 1h
