// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/ai/prompt-hash`
 * Purpose: Canonical prompt hash computation for AI reproducibility.
 * Scope: Compute SHA-256 hash of LLM payload for drift detection; shared by adapters and features. Does NOT handle IO.
 * Invariants:
 *   - Includes: model, messages, temperature, max_tokens, prompt_hash_version
 *   - Excludes: request_id, trace_id, user, metadata, tools (P1)
 *   - Uses stable key ordering (explicit construction, NOT sorted-keys)
 *   - Hash is identical across runs given identical logical payload
 * Side-effects: none (pure computation)
 * Notes: Per AI_SETUP_SPEC.md - computed BEFORE LLM call so available on error paths.
 * Links: AI_SETUP_SPEC.md, litellm.adapter.ts, completion.ts
 * @public
 */

import { createHash } from "node:crypto";

/**
 * Prompt hash version for canonicalization schema identification.
 * Bump only when canonical payload structure changes (field add/remove, ordering, serialization).
 * Per AI_SETUP_SPEC.md: MUST be embedded inside the hashed payload, not just metadata.
 */
export const PROMPT_HASH_VERSION = "phv1" as const;
export type PromptHashVersion = typeof PROMPT_HASH_VERSION;

/**
 * Canonical message for hashing.
 * Enforces string content only (constraint) to avoid lossy reshape.
 * Per AI_SETUP_SPEC.md: Excludes tool calls, images, multi-part content.
 * If support for richer message formats is needed, define a new canonical form.
 */
export interface CanonicalMessage {
  role: string;
  content: string;
}

/**
 * Canonical payload for hashing (v1).
 * Includes prompt_hash_version inside the payload so hash is self-describing.
 * Per AI_SETUP_SPEC.md: Excludes request_id, trace_id, user, metadata, tools.
 *
 * Tools excluded from P1 hash: When tool support is added, a strict canonical
 * tool schema must be defined to ensure deterministic JSON serialization.
 * Currently `unknown[]` would serialize non-deterministically across runtimes.
 */
export interface PromptHashPayloadV1 {
  prompt_hash_version: "phv1";
  model: string;
  messages: CanonicalMessage[];
  temperature: number;
  max_tokens: number;
  // NOTE: tools intentionally excluded from P1 hash
}

/**
 * Input shape for prompt hash computation.
 * Messages MUST already be in canonical form (role + string content only).
 * No reshaping performed - if input includes unsupported content types,
 * they must be handled before calling this function.
 * Caller should NOT include prompt_hash_version; computePromptHash adds it.
 */
export interface PromptHashInput {
  model: string;
  /** Already canonical: role + string content only */
  messages: CanonicalMessage[];
  temperature: number;
  maxTokens: number;
}

/**
 * Compute SHA-256 hash of canonical LLM payload for reproducibility.
 * Embeds prompt_hash_version inside the payload so hash is self-describing.
 *
 * Per AI_SETUP_SPEC.md:
 * - Includes: model, messages, temperature, max_tokens, tools (if any), prompt_hash_version
 * - Excludes: request_id, trace_id, user, metadata
 * - Uses stable key ordering via explicit construction
 *
 * @param payload - The input payload (version added automatically)
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
 * // => "a1b2c3d4e5..." (includes phv1 inside the hashed payload)
 * ```
 */
export function computePromptHash(payload: PromptHashInput): string {
  // Construct canonical v1 payload with explicit key order
  // prompt_hash_version MUST be in the hashed payload per AI_SETUP_SPEC.md
  // Normalize messages to ensure deterministic key order (role, then content)
  // Tools excluded from P1 hash until strict canonical schema is defined
  const canonical: PromptHashPayloadV1 = {
    prompt_hash_version: PROMPT_HASH_VERSION,
    model: payload.model,
    messages: payload.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: payload.temperature,
    max_tokens: payload.maxTokens,
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
export const DEFAULT_MAX_TOKENS = 4096;
