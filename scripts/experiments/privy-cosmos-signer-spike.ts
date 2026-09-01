// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/experiments/privy-cosmos-signer-spike`
 * Purpose: task.5059 spike entrypoint — proves the operator-signed Akash/Cosmos tx pipeline (address derivation, live akashnet-2 query, SIGN_MODE_DIRECT signing via a swappable raw-digest signer, TxRaw assembly, guarded broadcast).
 * Scope: Thin entrypoint; implementation + isolated deps live in ./privy-cosmos-spike/ (own package.json, not a pnpm workspace member). Does not contain pipeline logic.
 * Invariants: keyless + read-only by default (SPIKE_SIGNER=local, no broadcast).
 * Side-effects: IO (network), process.env
 * Links: work item task.5059 (story.5017), scripts/experiments/privy-cosmos-spike/main.ts
 * @internal
 *
 * Run:
 *   cd scripts/experiments/privy-cosmos-spike && pnpm install --ignore-workspace && cd -
 *   SPIKE_SIGNER=local pnpm tsx scripts/experiments/privy-cosmos-signer-spike.ts
 */

import "./privy-cosmos-spike/main.ts";
