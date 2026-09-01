// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@scripts/experiments/privy-cosmos-signer-spike`
 * Purpose: task.5059 spike entrypoint — proves the operator-signed Akash/Cosmos tx
 *   pipeline (address derivation, live akashnet-2 query, SIGN_MODE_DIRECT signing via a
 *   swappable raw-digest signer, TxRaw assembly, guarded broadcast). The ONLY missing
 *   piece for the Privy path is credentials.
 * Scope: Thin entrypoint; implementation + isolated deps live in ./privy-cosmos-spike/
 *   (own package.json, NOT a pnpm workspace member — `pnpm install --ignore-workspace` there).
 * Invariants: keyless + read-only by default (SPIKE_SIGNER=local, no broadcast).
 * Side-effects: IO (network), process.env, stdout
 * Links: work item task.5059 (story.5017), scripts/experiments/privy-cosmos-spike/main.ts
 * @internal — spike code, not for production use
 *
 * Run:
 *   cd scripts/experiments/privy-cosmos-spike && pnpm install --ignore-workspace && cd -
 *   SPIKE_SIGNER=local pnpm tsx scripts/experiments/privy-cosmos-signer-spike.ts
 */

import "./privy-cosmos-spike/main.ts";
