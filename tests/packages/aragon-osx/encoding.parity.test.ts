// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@aragon-osx/tests/encoding.parity`
 * Purpose: Golden test ensuring viem encoding matches Foundry output exactly.
 * Scope: Tests canonical Base mainnet OSx v1.4.0 MintSettings encoding; does not test v1.3/v1.4 branching.
 * Invariants: Encoded bytes must match Foundry script output byte-for-byte.
 * Side-effects: none
 * Links: packages/aragon-osx/src/encoding.ts
 * @public
 */

import {
  DEFAULT_VOTING_SETTINGS,
  DEPLOY_NEW_TOKEN_ADDRESS,
  encodeTokenVotingSetup,
  INITIAL_TOKEN_AMOUNT,
  MINT_SETTINGS_VERSION,
} from "@cogni/aragon-osx";
import { describe, expect, it } from "vitest";

describe("encodeTokenVotingSetup parity with Foundry", () => {
  it.todo("viem encoding matches Foundry golden bytes for Base mainnet canonical config", () => {
    // TODO: Generate fixture by running Foundry script in cogni-gov-contracts:
    // 1. cd cogni-gov-contracts
    // 2. forge script script/EncodeTokenVotingSetup.s.sol --sig "run(string,string,address)" "TestDAO" "TEST" "0x1234567890123456789012345678901234567890"
    // 3. Capture encoded bytes output
    // 4. Commit to packages/aragon-osx/tests/fixtures/foundry-golden.json
    //
    // Expected fixture shape:
    // {
    //   "tokenName": "TestDAO",
    //   "tokenSymbol": "TEST",
    //   "initialHolder": "0x1234567890123456789012345678901234567890",
    //   "foundryEncodedBytes": "0x..."
    // }

    const FIXTURE_TOKEN_NAME = "TestDAO";
    const FIXTURE_TOKEN_SYMBOL = "TEST";
    const FIXTURE_INITIAL_HOLDER =
      "0x1234567890123456789012345678901234567890" as const;

    // TODO: Replace with actual Foundry golden bytes
    const FOUNDRY_GOLDEN_BYTES = "0xTODO_REPLACE_WITH_FOUNDRY_OUTPUT";

    const viemEncoded = encodeTokenVotingSetup({
      votingSettings: DEFAULT_VOTING_SETTINGS,
      tokenSettings: {
        addr: DEPLOY_NEW_TOKEN_ADDRESS,
        name: FIXTURE_TOKEN_NAME,
        symbol: FIXTURE_TOKEN_SYMBOL,
      },
      mintSettings: {
        receivers: [FIXTURE_INITIAL_HOLDER],
        amounts: [INITIAL_TOKEN_AMOUNT],
      },
      targetConfig: {
        target: DEPLOY_NEW_TOKEN_ADDRESS,
        operation: 0,
      },
      minApprovals: 0n,
      pluginMetadata: "0x",
      excludedAccounts: [],
      mintSettingsVersion: MINT_SETTINGS_VERSION, // Canonical for Base mainnet
    });

    expect(viemEncoded).toBe(FOUNDRY_GOLDEN_BYTES);
  });
});
