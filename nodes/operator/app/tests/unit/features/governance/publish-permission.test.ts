// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `publish-permission.test`
 * Purpose: Pin the paired permission proof used by fresh distribution activation.
 * Scope: Pure calldata encoding and classification; no chain IO.
 */

import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";

import {
  buildPublishPermissionProbe,
  classifyCasPublishPermission,
  DAO_ABI,
} from "@/features/governance/lib/proposal-abis";

const TOKEN = "0x1111111111111111111111111111111111111111" as const;
const DISTRIBUTOR = "0x2222222222222222222222222222222222222222" as const;
const LIVE_ROOT =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;

describe("CAS publishing permission proof", () => {
  it("encodes the live root as callId and distinguishes the non-atomic probe", () => {
    const valid = decodeFunctionData({
      abi: DAO_ABI,
      data: buildPublishPermissionProbe(TOKEN, DISTRIBUTOR, LIVE_ROOT, 0n),
    });
    const nonAtomic = decodeFunctionData({
      abi: DAO_ABI,
      data: buildPublishPermissionProbe(TOKEN, DISTRIBUTOR, LIVE_ROOT, 1n),
    });

    expect(valid.functionName).toBe("execute");
    expect(valid.args?.[0]).toBe(LIVE_ROOT);
    expect(valid.args?.[2]).toBe(0n);
    expect(nonAtomic.args?.[0]).toBe(LIVE_ROOT);
    expect(nonAtomic.args?.[2]).toBe(1n);
  });

  it("verifies only the strict true/false pair", () => {
    expect(classifyCasPublishPermission(true, false)).toBe("verified");
    expect(classifyCasPublishPermission(true, true)).toBe("denied");
    expect(classifyCasPublishPermission(false, false)).toBe("denied");
    expect(classifyCasPublishPermission(false, true)).toBe("denied");
    expect(classifyCasPublishPermission(undefined, false)).toBe("loading");
  });
});
