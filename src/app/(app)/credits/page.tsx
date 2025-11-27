// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/credits/page`
 * Purpose: Server entrypoint for the protected credits page; loads repo-spec widget config and passes it to the client UI.
 * Scope: Server component only; delegates all client-side behavior to CreditsPageClient; does not perform client-side data fetching or widget wiring directly.
 * Invariants: Widget configuration must come from .cogni/repo-spec.yaml via server helper; no env-based overrides.
 * Side-effects: none (server render only)
 * Links: docs/DEPAY_PAYMENTS.md
 * @public
 */

import type { ReactElement } from "react";

import { getWidgetConfig } from "@/shared/config";

import { CreditsPageClient } from "./CreditsPage.client";

export default function CreditsPage(): ReactElement {
  const widgetConfig = getWidgetConfig();

  return <CreditsPageClient widgetConfig={widgetConfig} />;
}
