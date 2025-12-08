// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/_fakes`
 * Purpose: Verifies test fake availability and exports for deterministic unit testing conditions.
 * Scope: Re-exports fake implementations for testing. Does NOT export internal utilities or real implementations.
 * Invariants: All fakes available via barrel export; no circular dependencies; clean public API maintained.
 * Side-effects: none
 * Notes: Import fakes from here to replace I/O, time, and RNG in unit tests.
 * Links: tests/setup.ts
 * @public
 */

export {
  createMockAccountService,
  createMockAccountServiceWithDefaults,
  type MockAccountServiceOptions,
} from "./accounts/mock-account.service";
export * from "./ai/fakes";
export { FakeClock } from "./fake-clock";
export { FakeRng } from "./fake-rng";
export { FakeTelemetry } from "./fake-telemetry";
export * from "./payments/fakes";
export { makeTestCtx, type TestCtxOptions } from "./test-context";
