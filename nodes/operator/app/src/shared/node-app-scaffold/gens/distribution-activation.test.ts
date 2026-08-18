// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/node-app-scaffold/gens/distribution-activation`
 * Purpose: Pin the distribution-activation repo-spec splice: token + emissions holder are written,
 *   distributions become active, the OSS claim pattern is explicit, comments survive, and re-splice
 *   is a no-op.
 * Scope: Pure unit test over `renderDistributionActivationSpec`. No IO.
 * Invariants: OSS_CLAIM_PATH, NON_LINEAR_ACTIVATION, SINGLE_HOME, IDEMPOTENT_SPLICE.
 * Side-effects: none.
 * Links: src/shared/node-app-scaffold/gens/distribution-activation
 * @public
 */

import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import {
  DISTRIBUTION_CLAIM_CONTRACT_PATTERN,
  hasDistributionActivationSpec,
  renderDistributionActivationSpec,
} from "./distribution-activation";

const TOKEN = "0x2222222222222222222222222222222222222222";
const EMISSIONS_HOLDER = "0x3333333333333333333333333333333333333333";

const PENDING_SPEC = `# Node Template - repo-spec
schema_version: "0.1.4"

node_id: "abc"
scope_id: "def"
scope_key: "default"

intent:
  name: atlas
  mission: "do things"

governance:
  dao_contract: "0x1111111111111111111111111111111111111111"
  plugin_contract: "0x4444444444444444444444444444444444444444"
  signal_contract: "0x5555555555555555555555555555555555555555"
  chain_id: "8453"

activity_ledger:
  epoch_length_days: 7
  pool_config:
    base_issuance_credits: "10000"
  activity_sources:
    github:
      attribution_pipeline: cogni-v0.0
      source_refs: ["cogni-test-org/atlas"]

distributions:
  status: pending_activation

gates:
  - type: review-limits
    id: review_limits
`;

describe("renderDistributionActivationSpec", () => {
  const activated = renderDistributionActivationSpec(PENDING_SPEC, {
    tokenAddress: TOKEN,
    emissionsHolderAddress: EMISSIONS_HOLDER,
  });

  it("writes token, emissions holder, active status, and the OSS claim pattern", () => {
    const parsed = parseYaml(activated) as Record<string, unknown>;
    const governance = parsed.governance as Record<string, unknown>;
    const distributions = parsed.distributions as Record<string, unknown>;

    expect(governance.token_contract).toBe(TOKEN);
    expect(governance.emissions_holder).toBe(EMISSIONS_HOLDER);
    expect(distributions.status).toBe("active");
    expect(distributions.claim_contract_pattern).toBe(
      DISTRIBUTION_CLAIM_CONTRACT_PATTERN
    );
  });

  it("persists the v0 default when a legacy ledger has no pool_config", () => {
    const missingIssuance = PENDING_SPEC.replace(
      / {2}pool_config:\n {4}base_issuance_credits: "10000"\n/,
      ""
    );
    const reconciled = renderDistributionActivationSpec(missingIssuance, {
      tokenAddress: TOKEN,
      emissionsHolderAddress: EMISSIONS_HOLDER,
    });
    const parsed = parseYaml(reconciled) as {
      activity_ledger: {
        pool_config: { base_issuance_credits: string };
      };
    };
    expect(parsed.activity_ledger.pool_config.base_issuance_credits).toBe(
      "10000"
    );
  });

  it("expands an empty inline pool_config into valid explicit YAML", () => {
    const inlineEmptyPool = PENDING_SPEC.replace(
      / {2}pool_config:\n {4}base_issuance_credits: "10000"/,
      "  pool_config: {} # legacy placeholder"
    );
    const reconciled = renderDistributionActivationSpec(inlineEmptyPool, {
      tokenAddress: TOKEN,
      emissionsHolderAddress: EMISSIONS_HOLDER,
    });
    const parsed = parseYaml(reconciled) as {
      activity_ledger: {
        pool_config: { base_issuance_credits: string };
      };
    };

    expect(parsed.activity_ledger.pool_config.base_issuance_credits).toBe(
      "10000"
    );
    expect(reconciled).toContain("pool_config: # legacy placeholder");
  });

  it("rejects a nonempty inline pool policy that omits issuance", () => {
    const conflictingPool = PENDING_SPEC.replace(
      / {2}pool_config:\n {4}base_issuance_credits: "10000"/,
      '  pool_config: { future_policy: "custom" }'
    );
    expect(() =>
      renderDistributionActivationSpec(conflictingPool, {
        tokenAddress: TOKEN,
        emissionsHolderAddress: EMISSIONS_HOLDER,
      })
    ).toThrow(/cannot be reconciled safely/);
  });

  it("fails closed instead of overriding an explicit invalid issuance", () => {
    for (const configured of ["0", "-1", "10.5", "not-a-number"]) {
      const invalidIssuance = PENDING_SPEC.replace(
        'base_issuance_credits: "10000"',
        `base_issuance_credits: "${configured}"`
      );
      expect(() =>
        renderDistributionActivationSpec(invalidIssuance, {
          tokenAddress: TOKEN,
          emissionsHolderAddress: EMISSIONS_HOLDER,
        })
      ).toThrow(/must be a positive integer string/);
    }
  });

  // bug.5031 regression: the recorded claim pattern MUST name the distributor the
  // activation flow actually deploys + claims against — the vendored 1inch
  // CumulativeMerkleDrop — never the legacy non-cumulative uniswap pattern (which
  // does not match the deployed bytecode / `merkleRoot()` guard / cumulative fold).
  it("pins the vendored 1inch cumulative pattern, not the legacy uniswap one", () => {
    expect(DISTRIBUTION_CLAIM_CONTRACT_PATTERN).toBe(
      "1inch.cumulative-merkle-drop.v1"
    );
    expect(DISTRIBUTION_CLAIM_CONTRACT_PATTERN).not.toBe(
      "uniswap.merkle-distributor.v1"
    );
    const parsed = parseYaml(activated) as Record<string, unknown>;
    const distributions = parsed.distributions as Record<string, unknown>;
    expect(distributions.claim_contract_pattern).toBe(
      "1inch.cumulative-merkle-drop.v1"
    );
  });

  // bug.5031 regression: when the deploy path supplies a verified distributor, its
  // address MUST land in the spec (`distributions.distributor_address`) so the node
  // can resolve the distributor to publish/claim — it was silently dropped before.
  it("records distributor_address when the deploy path supplies one", () => {
    const DISTRIBUTOR = "0x6666666666666666666666666666666666666666";
    const withDistributor = renderDistributionActivationSpec(PENDING_SPEC, {
      tokenAddress: TOKEN,
      emissionsHolderAddress: EMISSIONS_HOLDER,
      distributorAddress: DISTRIBUTOR,
    });
    const parsed = parseYaml(withDistributor) as Record<string, unknown>;
    const distributions = parsed.distributions as Record<string, unknown>;
    expect(distributions.distributor_address).toBe(DISTRIBUTOR);
    expect(
      hasDistributionActivationSpec(withDistributor, {
        tokenAddress: TOKEN,
        emissionsHolderAddress: EMISSIONS_HOLDER,
        distributorAddress: DISTRIBUTOR,
      })
    ).toBe(true);
  });

  it("preserves existing governance identity and comments", () => {
    expect(activated).toContain("# Node Template - repo-spec");
    expect(activated).toContain(
      'dao_contract: "0x1111111111111111111111111111111111111111"'
    );
    const parsed = parseYaml(activated) as Record<string, unknown>;
    expect(Array.isArray(parsed.gates)).toBe(true);
  });

  it("is idempotent when re-splicing an activated spec", () => {
    const twice = renderDistributionActivationSpec(activated, {
      tokenAddress: TOKEN,
      emissionsHolderAddress: EMISSIONS_HOLDER,
    });
    expect(twice).toBe(activated);
    expect(
      hasDistributionActivationSpec(twice, {
        tokenAddress: TOKEN,
        emissionsHolderAddress: EMISSIONS_HOLDER,
      })
    ).toBe(true);
  });

  it("recognizes semantically active specs even when block placement differs", () => {
    const reordered = `# Node Template - repo-spec
schema_version: "0.1.4"

node_id: "abc"
scope_id: "def"
scope_key: "default"

distributions:
  status: active
  claim_contract_pattern: ${DISTRIBUTION_CLAIM_CONTRACT_PATTERN}

governance:
  dao_contract: "0x1111111111111111111111111111111111111111"
  plugin_contract: "0x4444444444444444444444444444444444444444"
  signal_contract: "0x5555555555555555555555555555555555555555"
  chain_id: "8453"
  token_contract: "${TOKEN.toUpperCase()}"
  emissions_holder: "${EMISSIONS_HOLDER.toUpperCase()}"

activity_ledger:
  epoch_length_days: 7
  pool_config:
    base_issuance_credits: "10000"
  activity_sources:
    github:
      attribution_pipeline: cogni-v0.0
      source_refs: ["cogni-test-org/atlas"]
`;

    expect(
      hasDistributionActivationSpec(reordered, {
        tokenAddress: TOKEN,
        emissionsHolderAddress: EMISSIONS_HOLDER,
      })
    ).toBe(true);
  });

  it("updates already-present distribution addresses", () => {
    const old = renderDistributionActivationSpec(PENDING_SPEC, {
      tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      emissionsHolderAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
    const next = renderDistributionActivationSpec(old, {
      tokenAddress: TOKEN,
      emissionsHolderAddress: EMISSIONS_HOLDER,
    });
    const parsed = parseYaml(next) as Record<string, unknown>;
    const governance = parsed.governance as Record<string, unknown>;
    expect(governance.token_contract).toBe(TOKEN);
    expect(governance.emissions_holder).toBe(EMISSIONS_HOLDER);
  });
});
