// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/gov/epoch/page`
 * Purpose: Server entrypoint for the current epoch governance page.
 * Scope: Read-only server entrypoint; delegates lifecycle rendering to CurrentEpochView.
 * Invariants: Auth enforced by (app) layout guard. All epoch mutations live in /gov/review.
 * Side-effects: none
 * Links: src/features/governance/types.ts, docs/spec/tokenomics-distribution.md
 * @public
 */

import type { ReactElement } from "react";

import { CurrentEpochView } from "./view";

export default function CurrentEpochPage(): ReactElement {
  return <CurrentEpochView />;
}
