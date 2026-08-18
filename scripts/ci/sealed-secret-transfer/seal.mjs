#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/ci/sealed-secret-transfer/seal`
 * Purpose: Seal explicitly bound canonical candidate credentials for the reviewed test-parent public key.
 * Scope: Reads four prefixed secret env vars plus DOMAIN; does not accept key material outside the committed manifest.
 * Invariants: NO_CALLER_SUPPLIED_KEY; NO_SECRET_PLAINTEXT_FILE; COMPLETE_ALLOWLIST_REQUIRED.
 * Side-effects: IO (writes one mode-0600 sealed bundle).
 * Links: task.5034, .github/workflows/candidate-a-sealed-secret-export.yml
 * @internal
 */

import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle, loadManifest, sealSecretBundle } from "./lib.mjs";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const manifestPath = resolve(scriptDir, "candidate-a-manifest.json");
const outputPath = resolve(
  process.env.SEALED_BUNDLE_OUTPUT ?? "candidate-a-sealed-secrets.json"
);

const manifest = await loadManifest(manifestPath);
const sourceSecrets = Object.fromEntries(
  manifest.secrets.map(({ name }) => [
    name,
    process.env[`SOURCE_SECRET_${name}`] ?? "",
  ])
);
const sourceVariables = Object.fromEntries(
  manifest.variables.map(({ name }) => [
    name,
    process.env[`SOURCE_VARIABLE_${name}`] ?? "",
  ])
);

const bundle = await sealSecretBundle({
  manifest,
  sourceSecrets,
  sourceVariables,
});
assertBundle(bundle, manifest);

await writeFile(outputPath, `${JSON.stringify(bundle)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
await chmod(outputPath, 0o600);
process.stdout.write(
  `sealed ${bundle.entries.length} secret names and captured ${bundle.variables.length} explicitly non-secret variables for the fixed candidate-a target; secret plaintext was not written\n`
);
