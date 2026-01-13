// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/config/provider-icons`
 * Purpose: Provides provider icon registry for model selection UI.
 * Scope: Maps provider keys to icon components (custom SVGs + Lucide fallbacks). Does not implement icon rendering logic.
 * Invariants: Icons use currentColor for theme compatibility.
 * Side-effects: none
 * Notes: Custom inline SVG components for major providers, Lucide fallbacks for others.
 * Links: Used by ModelPicker component
 * @internal
 */

import { Zap } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

import { AnthropicIcon } from "../icons/providers/AnthropicIcon";
import { DeepSeekIcon } from "../icons/providers/DeepSeekIcon";
import { GeminiIcon } from "../icons/providers/GeminiIcon";
import { KimiIcon } from "../icons/providers/KimiIcon";
import { LlamaIcon } from "../icons/providers/LlamaIcon";
import { MinimaxIcon } from "../icons/providers/MinimaxIcon";
import { MistralIcon } from "../icons/providers/MistralIcon";
import { NovaIcon } from "../icons/providers/NovaIcon";
import { NvidiaIcon } from "../icons/providers/NvidiaIcon";
import { OpenAIIcon } from "../icons/providers/OpenAIIcon";
import { QwenIcon } from "../icons/providers/QwenIcon";
import { XAIIcon } from "../icons/providers/XAIIcon";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Provider-to-icon mapping
 * Keys match provider_key from LiteLLM model_info
 */
const PROVIDER_ICONS = {
  amazon: NovaIcon,
  anthropic: AnthropicIcon,
  deepseek: DeepSeekIcon,
  google: GeminiIcon,
  kimi: KimiIcon,
  minimax: MinimaxIcon,
  mistral: MistralIcon,
  nvidia: NvidiaIcon,
  llama: LlamaIcon,
  openai: OpenAIIcon,
  qwen: QwenIcon,
  xai: XAIIcon,
  default: Zap,
} as const satisfies Record<string, IconComponent>;

/**
 * Extract provider key from model ID
 * Examples:
 * - "qwen3-4b" → "qwen"
 * - "gpt-4o-mini" → "gpt"
 * - "claude-3-haiku" → "claude"
 */
function getProviderKey(modelId: string): keyof typeof PROVIDER_ICONS {
  const match = modelId.match(/^([a-z]+)/i);
  if (!match?.[1]) return "default";

  const key = match[1].toLowerCase();
  return key in PROVIDER_ICONS
    ? (key as keyof typeof PROVIDER_ICONS)
    : "default";
}

/**
 * Get icon component for a model ID
 * Falls back to default icon if provider not found
 */
export function getProviderIcon(modelId: string): IconComponent {
  const providerKey = getProviderKey(modelId);
  return PROVIDER_ICONS[providerKey];
}

/**
 * Get icon component directly from provider key
 * Use when providerKey is available from model_info
 */
export function getIconByProviderKey(
  providerKey: string | undefined
): IconComponent {
  if (!providerKey) return PROVIDER_ICONS.default;
  return providerKey in PROVIDER_ICONS
    ? PROVIDER_ICONS[providerKey as keyof typeof PROVIDER_ICONS]
    : PROVIDER_ICONS.default;
}
