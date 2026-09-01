// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@bootstrap/capabilities/litellm-virtual-key`
 * Purpose: Factory for the per-workload LiteLLM virtual-key minter (task.5054).
 *   Mirrors createOperatorSecretsPlane: reads the operator's own env (proxy base +
 *   master key) and binds the adapter, so routes never import adapters directly.
 * Scope: Env read + closure binding only. No IO at construction.
 * Side-effects: none at construction (the mint call is IO per invocation).
 * Links: src/adapters/server/compute/litellm-virtual-key.adapter.ts,
 *   src/features/compute/workload-env-source.ts (consumes the minted key)
 * @internal
 */

import {
  type MintNodeVirtualKeyInput,
  mintNodeVirtualKey,
} from "@/adapters/server";
import type { ServerEnv } from "@/shared/env";

export type NodeVirtualKeyMinter = (
  input: MintNodeVirtualKeyInput
) => Promise<string>;

export function createNodeVirtualKeyMinter(
  env: ServerEnv
): NodeVirtualKeyMinter {
  const deps = {
    baseUrl: env.LITELLM_BASE_URL,
    masterKey: env.LITELLM_MASTER_KEY,
  };
  return (input) => mintNodeVirtualKey(deps, input);
}
