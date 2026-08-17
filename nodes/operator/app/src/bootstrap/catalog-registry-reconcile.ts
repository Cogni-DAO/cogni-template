// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/catalog-registry-reconcile`
 * Purpose: Trigger catalog registry projection immediately at boot and periodically as a fallback.
 * Scope: Process lifecycle and coalescing only; delegates all IO to the reconcile job.
 * Invariants:
 *   - BOOT_IS_IMMEDIATE: the first container initialization requests a reconcile without blocking it.
 *   - POLL_HEALS_MISSED_TRIGGERS: a ten-minute interval re-reads merged git through the App.
 *   - NO_OVERLAP: concurrent triggers coalesce; the job also has a cross-replica advisory lock.
 *   - TEST_INERT: automatic timers never start in tests.
 * Side-effects: schedules detached asynchronous work outside tests.
 * Links: bootstrap/container.ts, bootstrap/jobs/reconcileCatalogNodeRegistry.job.ts
 * @public
 */

const FALLBACK_INTERVAL_MS = 10 * 60 * 1000;

let _started = false;
let _running: Promise<void> | null = null;
let _rerunRequested = false;

/** Start an immediate reconcile plus the missed-trigger fallback, once per process. */
export function startCatalogRegistryReconcileOnBoot(): void {
  if (_started || isTestRuntime()) return;
  _started = true;
  triggerCatalogRegistryReconcile();
  const timer = setInterval(
    triggerCatalogRegistryReconcile,
    FALLBACK_INTERVAL_MS
  );
  timer.unref();
}

/**
 * Non-blocking trigger seam for a verified catalog-push handler. Calls coalesce while
 * one run is active; a trigger that arrives mid-run guarantees one follow-up read.
 */
export function triggerCatalogRegistryReconcile(): void {
  if (isTestRuntime()) return;
  if (_running) {
    _rerunRequested = true;
    return;
  }

  _running = runReconcile()
    .catch(() => {
      // The job records the error. The interval (or another trigger) retries.
    })
    .finally(() => {
      _running = null;
      if (_rerunRequested) {
        _rerunRequested = false;
        triggerCatalogRegistryReconcile();
      }
    });
}

async function runReconcile(): Promise<void> {
  // Dynamic import avoids a static container -> startup -> job -> container cycle.
  const { runCatalogNodeRegistryReconcileJob } = await import(
    "@/bootstrap/jobs/reconcileCatalogNodeRegistry.job"
  );
  await runCatalogNodeRegistryReconcileJob();
}

function isTestRuntime(): boolean {
  // biome-ignore lint/style/noProcessEnv: startup gate, before the config framework
  return process.env.APP_ENV === "test" || process.env.VITEST === "true";
}
