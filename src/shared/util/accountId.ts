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

import { createHash } from "crypto";

/**
 * Derives a collision-safe account ID from API key
 * Uses SHA256 hash to ensure stability and prevent collisions
 *
 * @param apiKey - The LiteLLM API key to derive account ID from
 * @returns Stable account ID in format "key:\{hash32chars\}"
 */
export function deriveAccountIdFromApiKey(apiKey: string): string {
  const hash = createHash("sha256").update(apiKey).digest("hex");
  return "key:" + hash.slice(0, 32);
}
