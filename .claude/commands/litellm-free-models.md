---
description: Update LiteLLM config with current free models from OpenRouter
---

# Update LiteLLM Free Models

You are updating the free models in the LiteLLM proxy configuration. Free models on OpenRouter change frequently - models get added, removed, or their capabilities change. This skill guides you through discovering, validating, and configuring free models.

## Context

- Config file: `platform/infra/services/runtime/configs/litellm.config.yaml`
- Provider icons: `src/features/ai/config/provider-icons.ts`
- Icon components: `src/features/ai/icons/providers/`
- Icon SVGs: `src/assets/icons/providers/`

## Step 1: Discovery - Query OpenRouter API

Free models are identified by the `:free` suffix in their model ID. Query the API to get current free models:

```bash
# Get all models with :free suffix
curl -s "https://openrouter.ai/api/v1/models" | jq '
  [.data[] | select(.id | endswith(":free")) | {id, context_length}]'
```

**Important:** Do NOT identify free models by `pricing.prompt == "0"`. The canonical identifier is the `:free` suffix.

## Step 2: Filter by Required Capabilities

Our application requires tool calling support. Filter models that have `tools` in their `supported_parameters`:

```bash
curl -s "https://openrouter.ai/api/v1/models" | jq '
  [.data[]
   | select(.id | endswith(":free"))
   | select(.supported_parameters | index("tools"))
   | {id, context_length}
  ] | sort_by(-.context_length)'
```

This is critical - models without tool support will fail with `error: "internal"` when our app sends tool definitions.

## Step 3: Diagnose Failures

If a model fails, check its `supported_parameters`:

```bash
curl -s "https://openrouter.ai/api/v1/models" | jq '
  .data[] | select(.id == "<model_id>:free") | {id, supported_parameters}'
```

Common failure causes:

- Missing `tools` parameter (model doesn't support function calling)
- Missing `tool_choice` parameter (can't control tool behavior)
- Model-specific requirements (e.g., `reasoning` parameter for some OpenAI models)

## Step 4: Selection Criteria

Select ~6 free models with these priorities:

1. **One model per provider** - Provider diversity for redundancy
2. **Prioritized providers**: Google, OpenAI, Qwen, Mistral, DeepSeek, Meta/Llama, NVIDIA
3. **Flash/fast models preferred** - Better latency
4. **Higher context length preferred** - More capable
5. **Must have `tools` in supported_parameters** - Required for our app

## Step 5: Update Config

Edit `platform/infra/services/runtime/configs/litellm.config.yaml`:

```yaml
# ===== FREE MODELS =====
# All validated for tool support via OpenRouter API (YYYY-MM-DD)
# Rate limits: 50 req/day (free plan) or 1000 req/day (>=$10 credits)

- model_name: <alias> # Our internal name (no "free" suffix)
  litellm_params:
    model: openrouter/<openrouter_model_id> # Must include :free suffix
    api_key: "os.environ/OPENROUTER_API_KEY"
  model_info:
    display_name: "<Display Name>" # Shown in UI (no "free" - app adds it)
    is_free: true
    provider_key: "<provider>" # Must match PROVIDER_ICONS key
```

For the default free model, add metadata:

```yaml
metadata:
  cogni:
    default_free: true
```

## Step 6: Add Provider Icons (if new provider)

If adding a model from a new provider:

1. **Add SVG**: `src/assets/icons/providers/<provider>-color.svg`

2. **Create component**: `src/features/ai/icons/providers/<Provider>Icon.tsx`

```tsx
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import type { SVGProps } from "react";

export function <Provider>Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {/* SVG paths with fill="currentColor" */}
    </svg>
  );
}
```

3. **Register icon**: `src/features/ai/config/provider-icons.ts`

```ts
import { <Provider>Icon } from "../icons/providers/<Provider>Icon";

const PROVIDER_ICONS = {
  // ... existing
  <provider>: <Provider>Icon,
};
```

## Step 7: User Manual Testing

After updating, restart LiteLLM and manually test each model in the app:

| Model   | Chat | Tool Call | Status |
| ------- | ---- | --------- | ------ |
| model-1 | [ ]  | [ ]       |        |
| model-2 | [ ]  | [ ]       |        |
| ...     |      |           |        |

Models may fail despite API claiming support. Common issues:

- Model temporarily unavailable
- Rate limits exceeded
- Model-specific parameter requirements (e.g., `reasoning` for some models)
- Provider-side issues

**TODO (future):** Automate validation with bounded probes:

- 1-2 chat completions per model
- 1 tool_call test if app requires it
- Strict max calls with backoff to avoid burning rate limits

## Rate Limits Reference

- **Free plan (no credits):** 50 req/day total + 20 rpm across all free models
- **With ≥$10 credits:** 1000 req/day for `:free` models

## Example: Current Free Models (2026-01-13)

```yaml
# Google - 1M context, flash model
- model_name: gemini-2-flash
  model: openrouter/google/gemini-2.0-flash-exp:free
  provider_key: "google"
  default_free: true

# Mistral - 256K context, agentic coding
- model_name: devstral
  model: openrouter/mistralai/devstral-2512:free
  provider_key: "mistral"

# Qwen - 262K context, coding specialist
- model_name: qwen3-coder
  model: openrouter/qwen/qwen3-coder:free
  provider_key: "qwen"

# Llama - 131K context, general purpose
- model_name: llama-3.3-70b
  model: openrouter/meta-llama/llama-3.3-70b-instruct:free
  provider_key: "llama"

# NVIDIA - 256K context, agentic tasks
- model_name: nemotron-nano-30b
  model: openrouter/nvidia/nemotron-3-nano-30b-a3b:free
  provider_key: "nvidia"
```

## Known Issues

- `openai/gpt-oss-120b:free` - Claims tool support but fails; may require `reasoning` parameter
- `moonshotai/kimi-k2:free` - No tool support despite being listed
- `amazon/nova-*:free` - No free variants exist (paid only)
