// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/setup/dao/page`
 * Purpose: Server entrypoint for DAO formation page; delegates to client component for wallet-signed formation flow.
 * Scope: Server component only; delegates all client-side behavior to DAOFormationPageClient. Does not perform data fetching or transaction logic.
 * Invariants: Requires authenticated session (wallet connected) via (app) route group.
 * Side-effects: none (server render only)
 * Links: docs/NODE_FORMATION_SPEC.md
 * @public
 */

import type { ReactElement } from "react";

import { DAOFormationPageClient } from "./DAOFormationPage.client";

export default function DAOFormationPage(): ReactElement {
  return <DAOFormationPageClient />;
}
