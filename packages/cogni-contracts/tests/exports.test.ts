// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/cogni-contracts/tests/exports`
 * Purpose: Validates package.json exports field blocks deep imports at runtime.
 * Scope: Tests built dist/ artifact, not source. Does NOT test architecture boundaries (see arch probes).
 * Invariants: Root import allowed, subpath imports blocked.
 * Side-effects: IO (dynamic imports)
 * Notes: Requires `pnpm --filter @cogni/cogni-contracts build` to run first.
 * Links: packages/cogni-contracts/package.json (exports field)
 * @public
 */

import { describe, expect, it } from "vitest";

describe("@cogni/cogni-contracts exports enforcement", () => {
  it("allows root import (workspace resolution check)", async () => {
    // This test MUST pass or exports tests are invalid (setup broken)
    const mod = await import("@cogni/cogni-contracts");

    expect(mod.COGNI_SIGNAL_ABI).toBeDefined();
    expect(mod.COGNI_SIGNAL_BYTECODE).toBeDefined();
  });

  it("blocks subpath import @cogni/cogni-contracts/cogni-signal", async () => {
    // Realistic bypass attempt: consumers often try package/module pattern
    const importPath = "@cogni/cogni-contracts" + "/cogni-signal";
    await expect(async () => {
      await import(/* @vite-ignore */ importPath);
    }).rejects.toThrow(
      /not exported|does not provide an export|Missing .* specifier in/
    );
  });

  it("blocks deep import to /src/cogni-signal (source path)", async () => {
    // Use dynamic string to prevent Vite static analysis
    const importPath = "@cogni/cogni-contracts" + "/src/cogni-signal";
    await expect(async () => {
      await import(/* @vite-ignore */ importPath);
    }).rejects.toThrow(
      /not exported|does not provide an export|Missing .* specifier in/
    );
  });

  it("blocks deep import to /src/cogni-signal/abi (source internal)", async () => {
    // Use dynamic string to prevent Vite static analysis
    const importPath = "@cogni/cogni-contracts" + "/src/cogni-signal/abi";
    await expect(async () => {
      await import(/* @vite-ignore */ importPath);
    }).rejects.toThrow(
      /not exported|does not provide an export|Missing .* specifier in/
    );
  });

  it("blocks deep import to /dist/cogni-signal (dist internal)", async () => {
    // Use dynamic string to prevent Vite static analysis
    const importPath = "@cogni/cogni-contracts" + "/dist/cogni-signal";
    await expect(async () => {
      await import(/* @vite-ignore */ importPath);
    }).rejects.toThrow(
      /not exported|does not provide an export|Missing .* specifier in/
    );
  });
});
