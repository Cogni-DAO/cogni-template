// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/util/account-id`
 * Purpose: Stable account ID derivation from API keys.
 * Scope: Collision-safe account ID generation using cryptographic hashing. Does not handle account creation or persistence.
 * Invariants: Deterministic mapping, cryptographically safe collision resistance
 * Side-effects: none (pure function)
 * Notes: Uses SHA256 for 2^128 collision space, prefixed for human readability
 * Links: Used at auth boundary, referenced by account provisioning
 * @public
 */

import { createHash } from "node:crypto";

/**
 * Derives a collision-safe account ID from an API key.
 *
 * SECURITY NOTE:
 * - This function is not a password hasher.
 * - Input apiKey MUST be a high-entropy, machine-generated secret. LiteLLM virtual keys follow
 *   format "sk-" + 22+ random base64-like chars, generated via cryptographically secure methods.
 * - We use fast SHA-256 solely to derive a stable, opaque public account ID from that key.
 * - For user passwords or low-entropy secrets, use a dedicated password hashing/KDF algorithm
 *   (e.g. argon2/bcrypt/scrypt/PBKDF2) and never reuse this utility.
 *
 * @see https://docs.litellm.ai/docs/proxy/virtual_keys - LiteLLM Virtual Key Documentation
 *
 * @param apiKey - The LiteLLM API key to derive account ID from
 * @returns Stable account ID in format "key:\{hash32chars\}"
 */
export function deriveAccountIdFromApiKey(apiKey: string): string {
  const hash = createHash("sha256").update(apiKey).digest("hex");
  return `key:${hash.slice(0, 32)}`;
}
