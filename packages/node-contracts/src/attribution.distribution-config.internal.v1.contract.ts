// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/attribution.distribution-config.internal.v1.contract`
 * Purpose: Wire format for the per-node distribution-config read (scheduler-worker -> operator gateway).
 * Scope: Wire format only; does not implement the route, the spec fetch, or the finalize fold.
 *   For GET /api/internal/attribution/distribution-config?nodeId=… : at epoch-finalize time the
 *   ledger worker resolves the distribution config (token, emissions holder, distributor, chain)
 *   of the node WHOSE EPOCH IS BEING FINALIZED from that node's own `.cogni/repo-spec.yaml`
 *   (SPECS_GIT_AUTHORITATIVE). The worker holds no GitHub credential (bug.5000), so the read is
 *   HTTP-delegated to the operator, which App-reads the node's repo-spec via its deploy plane —
 *   the same fetch plumbing the git-attribution profile resolver already uses.
 * Invariants:
 *   - Bearer SCHEDULER_API_TOKEN required (same internal-plane identity as review/receipts).
 *   - SPECS_GIT_AUTHORITATIVE: values come from the node's repo-spec, never env vars.
 *   - `distribution: null` ⇔ distributions not activated (or node/spec permanently unresolvable) —
 *     the finalize fold MUST no-op. Transient fetch failures are 503, never a silent null.
 *   - All consumers use z.infer types.
 * Side-effects: none
 * Links: /api/internal/attribution/distribution-config route,
 *   nodes/operator/app/src/features/nodes/node-distribution-config.ts (in-process resolver),
 *   packages/repo-spec/src/accessors.ts (extractDaoTokenDistributionConfig), bug.5020
 * @internal
 */

import { z } from "zod";

const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid address");

export const InternalNodeDistributionConfigSchema = z.object({
  /** Chain the node's governance token lives on (repo-spec `governance.chain_id`). */
  chainId: z.number().int().positive(),
  /** The node's GovernanceERC20 token (repo-spec `governance.token_contract`). */
  tokenAddress: evmAddress,
  /** DAO-controlled emissions holder (repo-spec `governance.emissions_holder`). */
  emissionsHolderAddress: evmAddress,
  /**
   * The ONE per-node cumulative Merkle distributor recorded at R2 activation
   * (repo-spec `distributions.distributor_address`). Null until R2 records it.
   */
  distributorAddress: evmAddress.nullable(),
});

export const InternalDistributionConfigInputSchema = z.object({
  /** repo-spec `node_id` of the node whose epoch is being finalized. */
  nodeId: z.string().uuid(),
});

export const InternalDistributionConfigOutputSchema = z.object({
  nodeId: z.string().uuid(),
  /** Null ⇔ distributions not activated for this node — the fold no-ops. */
  distribution: InternalNodeDistributionConfigSchema.nullable(),
  /** Why `distribution` is null — observability only, never machine-branched on. */
  reason: z.string().optional(),
});

export const internalDistributionConfigOperation = {
  id: "attribution.distribution-config.internal.v1",
  summary:
    "Read a node's distribution config from its repo-spec (worker -> operator gateway)",
  description:
    "Internal endpoint the ledger worker calls at finalize to resolve the finalizing node's " +
    "distribution config from that node's own repo-spec. Bearer SCHEDULER_API_TOKEN. " +
    "distribution=null means not activated (fold no-ops); transient spec-fetch failures are 503.",
  input: InternalDistributionConfigInputSchema,
  output: InternalDistributionConfigOutputSchema,
} as const;

export type InternalNodeDistributionConfig = z.infer<
  typeof InternalNodeDistributionConfigSchema
>;
export type InternalDistributionConfigInput = z.infer<
  typeof InternalDistributionConfigInputSchema
>;
export type InternalDistributionConfigOutput = z.infer<
  typeof InternalDistributionConfigOutputSchema
>;
