// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/ai/prompt-hash`
 * Purpose: Canonical prompt hash computation for AI reproducibility.
 * Scope: Compute SHA-256 hash of LLM payload for drift detection; shared by adapters and features. Does NOT handle IO.
 * Invariants:
 *   - Includes: model, messages, temperature, max_tokens, tools
 *   - Excludes: request_id, trace_id, user, metadata
 *   - Uses stable key ordering (explicit construction, NOT sorted-keys)
 *   - Hash is identical across runs given identical logical payload
 * Side-effects: none (pure computation)
 * Notes: Per AI_SETUP_SPEC.md - computed BEFORE LLM call so available on error paths.
 * Links: AI_SETUP_SPEC.md, litellm.adapter.ts, completion.ts
 * @public
 */

import { createHash } from "node:crypto";

/**
 * Input shape for prompt hash computation.
 * Messages are in LLM-ready format (role + content only).
 */
export interface PromptHashInput {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens: number;
  tools?: unknown[];
}

/**
 * Compute SHA-256 hash of canonical LLM payload for reproducibility.
 *
 * Per AI_SETUP_SPEC.md:
 * - Includes: model, messages, temperature, max_tokens, tools (if any)
 * - Excludes: request_id, trace_id, user, metadata
 * - Uses stable key ordering via explicit construction
 *
 * @param payload - The canonical payload to hash
 * @returns SHA-256 hex digest (64 chars)
 *
 * @example
 * ```ts
 * const hash = computePromptHash({
 *   model: "gpt-4",
 *   messages: [{ role: "user", content: "Hello" }],
 *   temperature: 0.7,
 *   maxTokens: 2048,
 * });
 * // => "a1b2c3d4e5..."
 * ```
 */
export function computePromptHash(payload: PromptHashInput): string {
  // Construct canonical object with explicit key order
  const canonical = {
    model: payload.model,
    messages: payload.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: payload.temperature,
    max_tokens: payload.maxTokens,
    ...(payload.tools?.length ? { tools: payload.tools } : {}),
  };

  // SHA-256 hash of deterministic JSON
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Default temperature for LLM calls.
 * Used when computing hash before LLM call.
 */
export const DEFAULT_TEMPERATURE = 0.7;

/**
 * Default max tokens for LLM calls.
 * Used when computing hash before LLM call.
 */
export const DEFAULT_MAX_TOKENS = 2048;
