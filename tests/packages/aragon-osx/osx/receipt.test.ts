// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@aragon-osx/tests/osx/receipt`
 * Purpose: Unit tests for strict OSx receipt decoders.
 * Scope: Tests address extraction from event logs; does not perform RPC calls.
 * Invariants: Decoders throw ReceiptDecodingError if expected events missing.
 * Side-effects: none
 * Links: packages/aragon-osx/src/osx/receipt.ts
 * @public
 */

import {
  DAO_REGISTERED_EVENT,
  decodeDaoAddress,
  decodeDaoCreationReceipt,
  decodePluginAddress,
  decodeSignalDeployment,
  type HexAddress,
  INSTALLATION_APPLIED_EVENT,
  ReceiptDecodingError,
  type TransactionReceipt,
} from "@cogni/aragon-osx";
import { describe, expect, it } from "vitest";

// ============================================================================
// Fixtures
// ============================================================================

const DAO_ADDRESS: HexAddress = "0x1234567890123456789012345678901234567890";
const PLUGIN_ADDRESS: HexAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
const CREATOR_ADDRESS: HexAddress =
  "0x9876543210987654321098765432109876543210";
const SIGNAL_ADDRESS: HexAddress = "0xfedcbafedcbafedcbafedcbafedcbafedcbafedc";

/**
 * Happy path: Successful DAO creation with both DAORegistered and InstallationApplied events.
 * Based on Aragon OSx v1.4.0 event structure.
 */
const HAPPY_DAO_CREATION_RECEIPT: TransactionReceipt = {
  status: "success",
  logs: [
    {
      address: "0xcc602EA573a42eBeC290f33F49D4A87177ebB8d2" as HexAddress, // DAOFactory
      topics: [
        DAO_REGISTERED_EVENT.topic,
        `0x000000000000000000000000${DAO_ADDRESS.slice(2)}` as `0x${string}`, // dao (indexed)
        `0x000000000000000000000000${CREATOR_ADDRESS.slice(2)}` as `0x${string}`, // creator (indexed)
      ],
      data: "0x", // subdomain (not indexed)
    },
    {
      address: "0x91a851E9Ed7F2c6d41b15F76e4a88f5A37067cC9" as HexAddress, // PSP
      topics: [
        INSTALLATION_APPLIED_EVENT.topic,
        `0x000000000000000000000000${DAO_ADDRESS.slice(2)}` as `0x${string}`, // dao (indexed)
        `0x000000000000000000000000${PLUGIN_ADDRESS.slice(2)}` as `0x${string}`, // plugin (indexed)
      ],
      data: "0x", // preparedSetupId, appliedSetupId (not indexed)
    },
  ],
  contractAddress: null,
};

/**
 * Missing DAORegistered event - decoder should throw.
 */
const RECEIPT_MISSING_DAO_EVENT: TransactionReceipt = {
  status: "success",
  logs: [
    {
      address: "0x91a851E9Ed7F2c6d41b15F76e4a88f5A37067cC9" as HexAddress,
      topics: [
        INSTALLATION_APPLIED_EVENT.topic,
        `0x000000000000000000000000${DAO_ADDRESS.slice(2)}` as `0x${string}`,
        `0x000000000000000000000000${PLUGIN_ADDRESS.slice(2)}` as `0x${string}`,
      ],
      data: "0x",
    },
  ],
  contractAddress: null,
};

/**
 * Missing InstallationApplied event - decoder should throw.
 */
const RECEIPT_MISSING_PLUGIN_EVENT: TransactionReceipt = {
  status: "success",
  logs: [
    {
      address: "0xcc602EA573a42eBeC290f33F49D4A87177ebB8d2" as HexAddress,
      topics: [
        DAO_REGISTERED_EVENT.topic,
        `0x000000000000000000000000${DAO_ADDRESS.slice(2)}` as `0x${string}`,
        `0x000000000000000000000000${CREATOR_ADDRESS.slice(2)}` as `0x${string}`,
      ],
      data: "0x",
    },
  ],
  contractAddress: null,
};

/**
 * Reverted transaction - decoder should throw.
 */
const REVERTED_RECEIPT: TransactionReceipt = {
  status: "reverted",
  logs: [],
  contractAddress: null,
};

/**
 * Successful CogniSignal deployment.
 */
const HAPPY_SIGNAL_DEPLOYMENT_RECEIPT: TransactionReceipt = {
  status: "success",
  logs: [],
  contractAddress: SIGNAL_ADDRESS,
};

/**
 * Deployment with no contractAddress - decoder should throw.
 */
const DEPLOYMENT_NO_CONTRACT_ADDRESS: TransactionReceipt = {
  status: "success",
  logs: [],
  contractAddress: null,
};

// ============================================================================
// Tests
// ============================================================================

describe("decodeDaoAddress", () => {
  it("extracts DAO address from DAORegistered event", () => {
    const daoAddress = decodeDaoAddress(HAPPY_DAO_CREATION_RECEIPT);
    expect(daoAddress).toBe(DAO_ADDRESS);
  });

  it("throws ReceiptDecodingError when DAORegistered event missing", () => {
    expect(() => decodeDaoAddress(RECEIPT_MISSING_DAO_EVENT)).toThrow(
      ReceiptDecodingError
    );
    expect(() => decodeDaoAddress(RECEIPT_MISSING_DAO_EVENT)).toThrow(
      /DAORegistered event not found/
    );
  });

  it("throws ReceiptDecodingError when transaction reverted", () => {
    expect(() => decodeDaoAddress(REVERTED_RECEIPT)).toThrow(
      ReceiptDecodingError
    );
    expect(() => decodeDaoAddress(REVERTED_RECEIPT)).toThrow(/reverted/);
  });
});

describe("decodePluginAddress", () => {
  it("extracts plugin address from InstallationApplied event", () => {
    const pluginAddress = decodePluginAddress(HAPPY_DAO_CREATION_RECEIPT);
    expect(pluginAddress).toBe(PLUGIN_ADDRESS);
  });

  it("throws ReceiptDecodingError when InstallationApplied event missing", () => {
    expect(() => decodePluginAddress(RECEIPT_MISSING_PLUGIN_EVENT)).toThrow(
      ReceiptDecodingError
    );
    expect(() => decodePluginAddress(RECEIPT_MISSING_PLUGIN_EVENT)).toThrow(
      /InstallationApplied event not found/
    );
  });

  it("throws ReceiptDecodingError when transaction reverted", () => {
    expect(() => decodePluginAddress(REVERTED_RECEIPT)).toThrow(
      ReceiptDecodingError
    );
  });
});

describe("decodeDaoCreationReceipt", () => {
  it("extracts both DAO and plugin addresses from successful receipt", () => {
    const result = decodeDaoCreationReceipt(HAPPY_DAO_CREATION_RECEIPT);
    expect(result.daoAddress).toBe(DAO_ADDRESS);
    expect(result.pluginAddress).toBe(PLUGIN_ADDRESS);
  });

  it("throws if either event missing", () => {
    expect(() => decodeDaoCreationReceipt(RECEIPT_MISSING_DAO_EVENT)).toThrow(
      ReceiptDecodingError
    );
    expect(() =>
      decodeDaoCreationReceipt(RECEIPT_MISSING_PLUGIN_EVENT)
    ).toThrow(ReceiptDecodingError);
  });
});

describe("decodeSignalDeployment", () => {
  it("extracts contractAddress from deployment receipt", () => {
    const signalAddress = decodeSignalDeployment(
      HAPPY_SIGNAL_DEPLOYMENT_RECEIPT
    );
    expect(signalAddress).toBe(SIGNAL_ADDRESS);
  });

  it("throws ReceiptDecodingError when contractAddress is null", () => {
    expect(() =>
      decodeSignalDeployment(DEPLOYMENT_NO_CONTRACT_ADDRESS)
    ).toThrow(ReceiptDecodingError);
    expect(() =>
      decodeSignalDeployment(DEPLOYMENT_NO_CONTRACT_ADDRESS)
    ).toThrow(/No contractAddress/);
  });

  it("throws ReceiptDecodingError when transaction reverted", () => {
    expect(() => decodeSignalDeployment(REVERTED_RECEIPT)).toThrow(
      ReceiptDecodingError
    );
  });
});
