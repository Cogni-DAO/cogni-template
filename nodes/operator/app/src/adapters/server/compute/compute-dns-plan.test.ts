// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@adapters/server/compute/compute-dns-plan.test`
 * Purpose: Pure-policy tests for per-lease compute DNS planning (task.5053) — lane ownership,
 *   protected-record refusal, foreign-zone exclusion, and Host-preserving target selection.
 * Scope: No IO, no mocks — pure function assertions (node-workload-spec.test.ts style).
 * Links: compute-dns-plan.ts
 */

import { describe, expect, it } from "vitest";

import {
  normalizeHostname,
  planComputeDnsRemoval,
  planComputeDnsUpserts,
  selectProviderOrigin,
  zoneRootOf,
} from "./compute-dns-plan";

describe("normalizeHostname", () => {
  it("lowercases and strips scheme, path, port, and trailing dot", () => {
    expect(normalizeHostname("HTTPS://Foo.Example.COM/path?q=1")).toBe(
      "foo.example.com"
    );
    expect(normalizeHostname("foo.example.com:8443")).toBe("foo.example.com");
    expect(normalizeHostname("foo.example.com.")).toBe("foo.example.com");
    expect(normalizeHostname("  bare-host  ")).toBe("bare-host");
  });
});

describe("zoneRootOf", () => {
  it("returns the registrable root (last two labels)", () => {
    expect(zoneRootOf("cognidao.org")).toBe("cognidao.org");
    expect(zoneRootOf("test.cognidao.org")).toBe("cognidao.org");
    expect(zoneRootOf("https://cognidao.org")).toBe("cognidao.org");
  });
});

describe("selectProviderOrigin", () => {
  it("prefers the configured stable origin (DEV2 STABLE_ORIGIN)", () => {
    expect(
      selectProviderOrigin({
        endpoints: ["abc123.ingress.provider.io"],
        hosts: ["toks4-akash.cognidao.org"],
        stableOrigin: "ingress.provider.io",
      })
    ).toBe("ingress.provider.io");
  });

  it("falls back to the first endpoint that is not a custom host", () => {
    expect(
      selectProviderOrigin({
        endpoints: [
          "toks4-akash.cognidao.org", // the custom host echoed back in uris
          "abc123.ingress.provider.io",
        ],
        hosts: ["toks4-akash.cognidao.org"],
      })
    ).toBe("abc123.ingress.provider.io");
  });

  it("returns undefined when no provider endpoint exists", () => {
    expect(
      selectProviderOrigin({
        endpoints: ["toks4-akash.cognidao.org"],
        hosts: ["toks4-akash.cognidao.org"],
      })
    ).toBeUndefined();
    expect(selectProviderOrigin({ endpoints: [], hosts: [] })).toBeUndefined();
  });
});

describe("planComputeDnsUpserts", () => {
  const zone = "cognidao.org";
  const endpoints = ["abc123.ingress.provider.io"];

  it("plans a CNAME for an eligible `<slug>-akash` host", () => {
    const plan = planComputeDnsUpserts({
      hosts: ["toks4-akash.cognidao.org"],
      endpoints,
      zone,
    });
    expect(plan.upserts).toEqual([
      {
        host: "toks4-akash.cognidao.org",
        name: "toks4-akash",
        target: "abc123.ingress.provider.io",
      },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips hosts outside the operator zone (foreign_zone)", () => {
    const plan = planComputeDnsUpserts({
      hosts: ["toks4-akash.example.net"],
      endpoints,
      zone,
    });
    expect(plan.upserts).toEqual([]);
    expect(plan.skipped).toEqual([
      { host: "toks4-akash.example.net", reason: "foreign_zone" },
    ]);
  });

  it("skips non `-akash` names — flight-managed records are untouchable (not_akash_lane)", () => {
    const plan = planComputeDnsUpserts({
      hosts: ["beacon-test.cognidao.org", "a.b-akash.cognidao.org"],
      endpoints,
      zone,
    });
    expect(plan.upserts).toEqual([]);
    expect(plan.skipped).toEqual([
      { host: "beacon-test.cognidao.org", reason: "not_akash_lane" },
      { host: "a.b-akash.cognidao.org", reason: "not_akash_lane" },
    ]);
  });

  it("refuses zone apex and www (protected)", () => {
    const plan = planComputeDnsUpserts({
      hosts: ["cognidao.org", "www.cognidao.org"],
      endpoints,
      zone,
    });
    expect(plan.upserts).toEqual([]);
    expect(plan.skipped).toEqual([
      { host: "cognidao.org", reason: "protected" },
      { host: "www.cognidao.org", reason: "protected" },
    ]);
  });

  it("skips when no target is derivable (no_target)", () => {
    const plan = planComputeDnsUpserts({
      hosts: ["toks4-akash.cognidao.org"],
      endpoints: [],
      zone,
    });
    expect(plan.upserts).toEqual([]);
    expect(plan.skipped).toEqual([
      { host: "toks4-akash.cognidao.org", reason: "no_target" },
    ]);
  });

  it("uses the stable origin override over the lease endpoint", () => {
    const plan = planComputeDnsUpserts({
      hosts: ["toks4-akash.cognidao.org"],
      endpoints,
      zone,
      stableOrigin: "ingress.provider.io",
    });
    expect(plan.upserts[0]?.target).toBe("ingress.provider.io");
  });
});

describe("planComputeDnsRemoval", () => {
  it("targets exactly the node's `<slug>-akash` record", () => {
    expect(
      planComputeDnsRemoval({ slug: "toks4", zone: "cognidao.org" })
    ).toEqual({
      name: "toks4-akash",
      fqdn: "toks4-akash.cognidao.org",
    });
  });

  it("returns null for slugs that cannot form a lane-owned name", () => {
    expect(
      planComputeDnsRemoval({ slug: "", zone: "cognidao.org" })
    ).toBeNull();
    expect(
      planComputeDnsRemoval({ slug: "bad.slug", zone: "cognidao.org" })
    ).toBeNull();
  });
});
