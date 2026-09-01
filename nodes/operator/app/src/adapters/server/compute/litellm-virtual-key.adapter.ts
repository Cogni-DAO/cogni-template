// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@adapters/server/compute/litellm-virtual-key`
 * Purpose: Mint a budget-capped LiteLLM VIRTUAL key for one node workload on
 *   decentralized compute (task.5054). The operator pod holds the shared proxy
 *   master (its own env) and exchanges it for a per-deploy scoped key so the
 *   master never reaches a compute provider (SCOPED_CREDS_ONLY).
 * Scope: One `/key/generate` call. No key registry/cleanup (vNext with the
 *   compute_resources read-cache — each key is budget-capped so an orphan is
 *   bounded spend, not unbounded).
 * Invariants:
 *   - MASTER_STAYS_SERVER_SIDE: the master key authenticates this call only; the
 *     returned virtual key is what ships in the workload env.
 *   - BUDGET_CAPPED: max_budget + budget_duration on every minted key.
 *   - NO_SECRETS_IN_CONTEXT: neither key is ever logged; errors carry status only.
 * Side-effects: IO (LiteLLM admin HTTP; creates a proxy key row)
 * Links: features/compute/workload-env-source.ts (consumes the key),
 *   docs re proxy: https://docs.litellm.ai/docs/proxy/virtual_keys
 * @internal
 */

/** Monthly spend cap (USD) for one node-workload virtual key. */
export const NODE_WORKLOAD_KEY_MAX_BUDGET_USD = 25;
/** Budget window — resets so a long-lived workload keeps serving. */
export const NODE_WORKLOAD_KEY_BUDGET_DURATION = "30d";

export interface MintNodeVirtualKeyDeps {
  /** Operator-local LiteLLM base (cluster-reachable), e.g. `http://operator-litellm-external:4000`. */
  readonly baseUrl: string;
  /** Shared proxy master key from the operator's own env — never forwarded. */
  readonly masterKey: string;
  readonly fetchImpl?: typeof fetch;
}

export interface MintNodeVirtualKeyInput {
  readonly slug: string;
  readonly nodeId: string;
  readonly sourceSha: string;
}

/** Mint one budget-capped virtual key; throws a coded error on failure. */
export async function mintNodeVirtualKey(
  deps: MintNodeVirtualKeyDeps,
  input: MintNodeVirtualKeyInput
): Promise<string> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl(
    `${deps.baseUrl.replace(/\/+$/, "")}/key/generate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${deps.masterKey}`,
      },
      body: JSON.stringify({
        max_budget: NODE_WORKLOAD_KEY_MAX_BUDGET_USD,
        budget_duration: NODE_WORKLOAD_KEY_BUDGET_DURATION,
        metadata: {
          purpose: "compute-node-workload",
          node_id: input.nodeId,
          slug: input.slug,
          source_sha: input.sourceSha,
        },
      }),
    }
  );
  if (!res.ok) {
    throw Object.assign(
      new Error(`litellm_key_mint_failed (status ${res.status})`),
      { code: "litellm_key_mint_failed", status: res.status }
    );
  }
  const body = (await res.json()) as { key?: string };
  if (!body.key) {
    throw Object.assign(new Error("litellm_key_mint_no_key"), {
      code: "litellm_key_mint_failed",
      status: 502,
    });
  }
  return body.key;
}
