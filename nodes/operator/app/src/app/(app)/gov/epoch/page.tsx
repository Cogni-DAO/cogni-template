// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/gov/epoch/page`
 * Purpose: Server entrypoint for the current epoch governance page.
 * Scope: Server component only; delegates all client behavior to CurrentEpochView. Does not perform data fetching.
 * Invariants: Auth enforced by (app) layout guard. Resolves the operator's own node id
 *   server-side (getNodeId) and passes it to the client view so the finalized-epoch
 *   ExecuteDistributionPanel can address the authed per-node distribution-tx route.
 * Side-effects: none (server render only; reads repo-spec node id)
 * Links: src/features/governance/types.ts, src/shared/config/repoSpec.server.ts
 * @public
 */

import type { ReactElement } from "react";

import { getNodeId } from "@/shared/config/repoSpec.server";
import { CurrentEpochView } from "./view";

export default function CurrentEpochPage(): ReactElement {
  return <CurrentEpochView nodeId={getNodeId()} />;
}
