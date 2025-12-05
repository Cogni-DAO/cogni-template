// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/client`
 * Purpose: Client-side observability utilities.
 * Scope: Browser-safe logging and telemetry. Does not use Node.js APIs.
 * Invariants: Uses same EventName registry as server; no log shipping (MVP).
 * Side-effects: IO (console)
 * Notes: Use for client components only.
 * Links: Re-exports client logger
 * @public
 */

export { debug, error, info, warn } from "./logger";
