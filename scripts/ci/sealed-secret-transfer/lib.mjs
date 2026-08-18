// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/ci/sealed-secret-transfer/lib`
 * Purpose: Validate and libsodium-seal the minimal candidate deployment authority contract.
 * Scope: Pure manifest/bundle validation plus sealed-box encryption; does not access GitHub or runtime state.
 * Invariants: EXACT_FOUR_SECRET_ALLOWLIST; REVIEWED_TARGET_KEY; NO_RUNTIME_SECRET_TRANSFER.
 * Side-effects: IO (reads the reviewed manifest); cryptographic randomness for sealed boxes.
 * Links: task.5034, docs/spec/secrets-management.md, docs/spec/secrets-classification.md
 * @internal
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sodium from "libsodium-wrappers";

export const EXPECTED_SOURCE = Object.freeze({
  repository: "cogni-dao/cogni",
  environment: "candidate-a",
});
export const EXPECTED_TARGET = Object.freeze({
  repository: "cogni-test-org/cogni-monorepo",
  environment: "candidate-a",
});
export const EXPECTED_SECRET_NAMES = Object.freeze([
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ZONE_ID",
  "SSH_DEPLOY_KEY",
  "VM_HOST",
]);
export const EXPECTED_SECRET_COUNT = EXPECTED_SECRET_NAMES.length;
export const EXPECTED_VARIABLE_NAMES = Object.freeze(["DOMAIN"]);

function sameEndpoint(actual, expected) {
  return (
    actual?.repository === expected.repository &&
    actual?.environment === expected.environment
  );
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function loadManifest(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  assertManifest(manifest);
  return manifest;
}

export function assertManifest(manifest) {
  if (manifest?.version !== 1) {
    throw new Error("manifest version must be 1");
  }
  if (!sameEndpoint(manifest.source, EXPECTED_SOURCE)) {
    throw new Error(
      "manifest source is not the fixed canonical candidate-a environment"
    );
  }
  if (!sameEndpoint(manifest.target, EXPECTED_TARGET)) {
    throw new Error(
      "manifest target is not the fixed test-parent candidate-a environment"
    );
  }
  const sealingKey = manifest.target.sealingKey;
  if (!sealingKey || !/^[A-Za-z0-9_-]+$/.test(sealingKey.keyId ?? "")) {
    throw new Error("manifest target sealing key id is missing or malformed");
  }
  if (
    typeof sealingKey.publicKey !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(sealingKey.publicKey) ||
    Buffer.from(sealingKey.publicKey, "base64").length !==
      sodium.crypto_box_PUBLICKEYBYTES
  ) {
    throw new Error("manifest target sealing public key is malformed");
  }
  if (!Array.isArray(manifest.secrets)) {
    throw new Error("manifest secrets must be an array");
  }
  const names = manifest.secrets.map((entry) => entry?.name);
  const uniqueNames = new Set(names);
  if (
    names.length !== EXPECTED_SECRET_COUNT ||
    uniqueNames.size !== names.length
  ) {
    throw new Error(
      `manifest must contain exactly ${EXPECTED_SECRET_COUNT} unique secret names`
    );
  }
  if (
    canonicalJson([...names].sort()) !==
    canonicalJson([...EXPECTED_SECRET_NAMES].sort())
  ) {
    throw new Error(
      "manifest secret allowlist is not the exact candidate flight 4-name set"
    );
  }
  for (const entry of manifest.secrets) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(entry.name ?? "")) {
      throw new Error(`invalid secret name in manifest: ${entry.name}`);
    }
    if (!/^[a-z][a-z0-9-]*$/.test(entry.authorityClass ?? "")) {
      throw new Error(`missing authority classification for ${entry.name}`);
    }
  }
  const preserve = manifest.targetRepositorySecretsToPreserve;
  if (!Array.isArray(preserve) || preserve.length === 0) {
    throw new Error("target repository-level preservation set is required");
  }
  if (!Array.isArray(manifest.variables)) {
    throw new Error("manifest variables must be an array");
  }
  const variableNames = manifest.variables.map((entry) => entry?.name);
  if (
    canonicalJson([...variableNames].sort()) !==
    canonicalJson([...EXPECTED_VARIABLE_NAMES].sort())
  ) {
    throw new Error(
      "manifest must contain the exact candidate environment variable set"
    );
  }
  for (const entry of manifest.variables) {
    if (entry.authorityClass !== "candidate-plane-config") {
      throw new Error(
        `invalid variable authority classification for ${entry.name}`
      );
    }
  }
}

export function manifestDigest(manifest) {
  return sha256(canonicalJson(manifest));
}

function decodeTargetPublicKey(publicKey) {
  let decoded;
  try {
    decoded = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  } catch {
    throw new Error("target public key must be valid base64");
  }
  if (decoded.length !== sodium.crypto_box_PUBLICKEYBYTES) {
    throw new Error(
      `target public key must decode to ${sodium.crypto_box_PUBLICKEYBYTES} bytes`
    );
  }
  return decoded;
}

export async function sealSecretBundle({
  manifest,
  sourceSecrets,
  sourceVariables,
  generatedAt = new Date().toISOString(),
}) {
  assertManifest(manifest);
  await sodium.ready;
  const keyBytes = decodeTargetPublicKey(manifest.target.sealingKey.publicKey);
  const missing = [];
  const entries = [];
  for (const { name, authorityClass } of manifest.secrets) {
    const value = sourceSecrets?.[name];
    if (typeof value !== "string" || value.length === 0) {
      missing.push(name);
      continue;
    }
    const encrypted = sodium.crypto_box_seal(
      sodium.from_string(value),
      keyBytes
    );
    entries.push({
      name,
      authorityClass,
      encryptedValue: sodium.to_base64(
        encrypted,
        sodium.base64_variants.ORIGINAL
      ),
    });
  }

  const variables = manifest.variables.map(({ name, authorityClass }) => {
    const value = sourceVariables?.[name];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(
        `source environment variable is missing or empty: ${name}`
      );
    }
    return { name, authorityClass, value };
  });

  return {
    version: 1,
    source: EXPECTED_SOURCE,
    target: EXPECTED_TARGET,
    targetKeyId: manifest.target.sealingKey.keyId,
    generatedAt,
    manifestSha256: manifestDigest(manifest),
    entries,
    missing,
    variables,
  };
}

export function assertBundle(
  bundle,
  manifest,
  { requireComplete = true } = {}
) {
  assertManifest(manifest);
  if (bundle?.version !== 1) {
    throw new Error("bundle version must be 1");
  }
  if (!sameEndpoint(bundle.source, EXPECTED_SOURCE)) {
    throw new Error("bundle source is not fixed to canonical candidate-a");
  }
  if (!sameEndpoint(bundle.target, EXPECTED_TARGET)) {
    throw new Error("bundle target is not fixed to test-parent candidate-a");
  }
  if (bundle.manifestSha256 !== manifestDigest(manifest)) {
    throw new Error(
      "bundle manifest digest does not match the local reviewed manifest"
    );
  }
  if (bundle.targetKeyId !== manifest.target.sealingKey.keyId) {
    throw new Error(
      "bundle target key id does not match the reviewed manifest"
    );
  }
  if (!Array.isArray(bundle.entries) || !Array.isArray(bundle.missing)) {
    throw new Error("bundle entries and missing lists are required");
  }
  if (!Array.isArray(bundle.variables)) {
    throw new Error("bundle variables are required");
  }
  const manifestByName = new Map(
    manifest.secrets.map((entry) => [entry.name, entry.authorityClass])
  );
  const seen = new Set();
  for (const entry of bundle.entries) {
    if (seen.has(entry?.name) || !manifestByName.has(entry?.name)) {
      throw new Error(
        `bundle contains duplicate or unmanifested name: ${entry?.name}`
      );
    }
    if (entry.authorityClass !== manifestByName.get(entry.name)) {
      throw new Error(
        `bundle authority classification drift for ${entry.name}`
      );
    }
    if (!entry.encryptedValue || typeof entry.encryptedValue !== "string") {
      throw new Error(`bundle ciphertext missing for ${entry.name}`);
    }
    seen.add(entry.name);
  }
  const missing = new Set(bundle.missing);
  if (missing.size !== bundle.missing.length) {
    throw new Error("bundle missing list contains duplicates");
  }
  for (const name of missing) {
    if (!manifestByName.has(name) || seen.has(name)) {
      throw new Error(`bundle missing list contains invalid name: ${name}`);
    }
  }
  if (seen.size + missing.size !== manifest.secrets.length) {
    throw new Error("bundle does not account for every manifested secret");
  }
  if (requireComplete && missing.size > 0) {
    throw new Error(
      `bundle is incomplete; missing: ${[...missing].join(", ")}`
    );
  }
  const bundleVariableNames = bundle.variables.map((entry) => entry?.name);
  if (
    canonicalJson([...bundleVariableNames].sort()) !==
    canonicalJson([...EXPECTED_VARIABLE_NAMES].sort())
  ) {
    throw new Error("bundle does not contain the exact candidate variable set");
  }
  for (const variable of bundle.variables) {
    if (
      variable.authorityClass !== "candidate-plane-config" ||
      typeof variable.value !== "string" ||
      variable.value.length === 0
    ) {
      throw new Error(`bundle variable is malformed: ${variable.name}`);
    }
  }
}
