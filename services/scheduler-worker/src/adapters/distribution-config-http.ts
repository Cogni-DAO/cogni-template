// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/adapters/distribution-config-http`
 * Purpose: HTTP client for the operator's internal per-node distribution-config read.
 * Scope: At epoch-finalize the ledger worker resolves the FINALIZING node's distribution
 *   config (token / emissions holder / distributor / chain) from that node's OWN repo-spec.
 *   The worker owns no GitHub credential (bug.5000) and must bake no node's governance
 *   identity (bug.5020), so the read routes to the operator's
 *   `/api/internal/attribution/distribution-config` gateway. Mirrors review-http.ts.
 * Invariants:
 *   - WORKER_HOLDS_NO_GITHUB_CRED: no Octokit, no App key — only fetch().
 *   - Always targets the operator node (it owns the deploy-plane App-read).
 *   - Bearer SCHEDULER_API_TOKEN attached to every request.
 *   - TRANSIENT_IS_ERROR_NOT_NULL: 5xx / 503 / transient-4xx / network errors rethrow as a
 *     retryable RunHttpClientError so the caller falls back to baked config (never silent null).
 *   - `distribution: null` in a 200 body ⇔ distributions not activated — the fold no-ops.
 * Side-effects: IO (HTTP)
 * Links: bug.5000, bug.5020,
 *   packages/node-contracts/src/attribution.distribution-config.internal.v1.contract.ts,
 *   nodes/operator/app/src/app/api/internal/attribution/distribution-config/route.ts
 * @internal
 */

import type { InternalDistributionConfigOutput } from "@cogni/node-contracts";
import type { Logger } from "../observability/logger.js";
import {
  type DistributionConfigHttpClient,
  RunHttpClientError,
} from "../ports/index.js";

export interface DistributionConfigHttpAdapterDeps {
  /** COGNI_NODE_ENDPOINTS map — distribution-config always resolves the "operator" entry. */
  nodeEndpoints: Map<string, string>;
  schedulerApiToken: string;
  logger: Logger;
}

const RETRYABLE_TRANSIENT_4XX = new Set([404, 408, 409, 429]);
function isRetryableStatus(status: number): boolean {
  if (status >= 500) return true;
  return RETRYABLE_TRANSIENT_4XX.has(status);
}

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function readErrorText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable>";
  }
}

export function createDistributionConfigHttpClient(
  deps: DistributionConfigHttpAdapterDeps
): DistributionConfigHttpClient {
  const { nodeEndpoints, schedulerApiToken, logger } = deps;

  /** Distribution config is operator-owned. Resolve the operator base URL at call time. */
  function operatorBase(): string {
    const url = nodeEndpoints.get("operator");
    if (!url) {
      throw new RunHttpClientError(
        'Distribution-config HTTP delegation requires an "operator" entry in COGNI_NODE_ENDPOINTS',
        0,
        false
      );
    }
    return url.replace(/\/$/, "");
  }

  return {
    async resolveForNode(nodeId) {
      const url = `${operatorBase()}/api/internal/attribution/distribution-config?nodeId=${encodeURIComponent(
        nodeId
      )}`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: "GET",
          headers: authHeaders(schedulerApiToken),
        });
      } catch (err) {
        throw new RunHttpClientError(`fetch ${url} failed: ${err}`, 0, true);
      }
      if (!response.ok) {
        const errorText = await readErrorText(response);
        const retryable = isRetryableStatus(response.status);
        logger.error(
          { url, status: response.status, errorText, retryable, nodeId },
          "attribution.distribution-config request failed"
        );
        throw new RunHttpClientError(
          `GET ${url} -> ${response.status}: ${errorText}`,
          response.status,
          retryable
        );
      }
      // Trusted by shape (cast, not re-validated) — same contract-typed delegation
      // pattern as review-http.ts. The operator produced this from its own
      // zod-validated route handler (output.parse).
      const json = (await response.json()) as InternalDistributionConfigOutput;
      return { distribution: json.distribution, reason: json.reason };
    },
  };
}
