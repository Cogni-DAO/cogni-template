// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/sandbox`
 * Purpose: Barrel export for sandbox adapters.
 * Scope: Exports only; does not contain implementation logic.
 * Invariants: Exports must match public API surface.
 * Side-effects: none (at import time - adapters have runtime effects when instantiated)
 * Links: src/adapters/server/sandbox/sandbox-runner.adapter.ts
 * @internal
 */

export { SandboxRunnerAdapter } from "./sandbox-runner.adapter";
