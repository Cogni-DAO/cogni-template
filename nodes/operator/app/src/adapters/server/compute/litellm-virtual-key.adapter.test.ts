// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it, vi } from "vitest";
import { mintNodeVirtualKey } from "./litellm-virtual-key.adapter";

const INPUT = {
  slug: "toks4",
  nodeId: "72aa130b-f0ad-495a-a061-9ee1f9c9525d",
  sourceSha: "a".repeat(40),
};

describe("mintNodeVirtualKey", () => {
  it("POSTs /key/generate with master auth + budget cap, returns the virtual key", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("http://litellm:4000/key/generate");
      expect(init?.headers).toMatchObject({
        authorization: "Bearer sk-master",
      });
      const body = JSON.parse(String(init?.body));
      expect(body.max_budget).toBeGreaterThan(0);
      expect(body.budget_duration).toBeTruthy();
      expect(body.metadata).toMatchObject({
        purpose: "compute-node-workload",
        node_id: INPUT.nodeId,
        slug: "toks4",
      });
      return new Response(JSON.stringify({ key: "sk-virtual-abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const key = await mintNodeVirtualKey(
      { baseUrl: "http://litellm:4000/", masterKey: "sk-master", fetchImpl },
      INPUT
    );
    expect(key).toBe("sk-virtual-abc");
  });

  it("throws a coded error on non-2xx or a keyless body", async () => {
    const fail = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 401 })
    );
    await expect(
      mintNodeVirtualKey(
        {
          baseUrl: "http://litellm:4000",
          masterKey: "sk-master",
          fetchImpl: fail,
        },
        INPUT
      )
    ).rejects.toMatchObject({ code: "litellm_key_mint_failed", status: 401 });

    const noKey = vi.fn<typeof fetch>(
      async () => new Response("{}", { status: 200 })
    );
    await expect(
      mintNodeVirtualKey(
        {
          baseUrl: "http://litellm:4000",
          masterKey: "sk-master",
          fetchImpl: noKey,
        },
        INPUT
      )
    ).rejects.toMatchObject({ code: "litellm_key_mint_failed" });
  });
});
