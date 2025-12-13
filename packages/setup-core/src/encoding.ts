// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@setup-core/encoding`
 * Purpose: ABI-encode Aragon TokenVoting setup data for Node Formation P0.
 * Scope: Pure encoding only; no RPC.
 * Invariants: Encoded layout must match OSx TokenVoting setup contract.
 * Side-effects: none
 * @public
 */

import { encodeAbiParameters, parseAbiParameters } from "viem";

export type Hex = `0x${string}`;
export type HexAddress = `0x${string}`;

export type TokenVotingVotingSettings = {
  votingMode: number; // uint8
  supportThreshold: number; // uint32
  minParticipation: number; // uint32
  minDuration: bigint; // uint64
  minProposerVotingPower: bigint; // uint256
};

export type TokenVotingTokenSettings = {
  token: HexAddress; // address
  name: string;
  symbol: string;
};

export type TokenVotingMintSettings = {
  receivers: readonly HexAddress[];
  amounts: readonly bigint[];
  ensureDelegationOnMint: boolean;
};

export type TokenVotingTargetConfig = {
  target: HexAddress;
  operation: number; // uint8
};

export function encodeTokenVotingSetup(params: {
  votingSettings: TokenVotingVotingSettings;
  tokenSettings: TokenVotingTokenSettings;
  mintSettings: TokenVotingMintSettings;
  initialHolders: readonly HexAddress[];
  initialVotingPower: readonly bigint[];
  initialBalances: readonly bigint[];
  admins: readonly HexAddress[];
  // TokenVoting requires a list of allowed actions to be executed.
  // For P0 we keep this fixed to `[]`.
  targetConfig?: readonly TokenVotingTargetConfig[];
}): Hex {
  const targetConfig = params.targetConfig ?? [];

  // Layout based on `DAO_FORMATION_SCRIPT.md`:
  // (
  //   VotingSettings,
  //   TokenSettings,
  //   MintSettings,
  //   address[] initialHolders,
  //   uint256[] initialVotingPower,
  //   uint256[] initialBalances,
  //   address[] admins,
  //   TargetConfig[] targetConfig
  // )
  const abi = parseAbiParameters(
    "(uint8 votingMode,uint32 supportThreshold,uint32 minParticipation,uint64 minDuration,uint256 minProposerVotingPower) votingSettings," +
      "(address token,string name,string symbol) tokenSettings," +
      "(address[] receivers,uint256[] amounts,bool ensureDelegationOnMint) mintSettings," +
      "address[] initialHolders," +
      "uint256[] initialVotingPower," +
      "uint256[] initialBalances," +
      "address[] admins," +
      "(address target,uint8 operation)[] targetConfig"
  );

  return encodeAbiParameters(abi, [
    {
      votingMode: params.votingSettings.votingMode,
      supportThreshold: params.votingSettings.supportThreshold,
      minParticipation: params.votingSettings.minParticipation,
      minDuration: params.votingSettings.minDuration,
      minProposerVotingPower: params.votingSettings.minProposerVotingPower,
    },
    {
      token: params.tokenSettings.token,
      name: params.tokenSettings.name,
      symbol: params.tokenSettings.symbol,
    },
    {
      receivers: [...params.mintSettings.receivers],
      amounts: [...params.mintSettings.amounts],
      ensureDelegationOnMint: params.mintSettings.ensureDelegationOnMint,
    },
    [...params.initialHolders],
    [...params.initialVotingPower],
    [...params.initialBalances],
    [...params.admins],
    targetConfig.map((t) => ({ target: t.target, operation: t.operation })),
  ]);
}
