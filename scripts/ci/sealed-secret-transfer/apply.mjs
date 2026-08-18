#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/ci/sealed-secret-transfer/apply`
 * Purpose: Apply one reviewed ciphertext bundle to the fixed test-parent candidate environment.
 * Scope: Writes four environment secrets and DOMAIN; does not read source state or mutate repository-level secrets.
 * Invariants: FIXED_CANDIDATE_AUTHORITY_TARGET; CIPHERTEXT_ONLY_SECRET_APPLY; TARGET_REPO_SECRETS_PRESERVED.
 * Side-effects: IO (reads one local bundle; with explicit confirmation, calls fixed target GitHub APIs).
 * Links: task.5034, scripts/ci/sealed-secret-transfer/candidate-a-manifest.json
 * @internal
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBundle, EXPECTED_TARGET, loadManifest } from "./lib.mjs";

const CONFIRMATION = `${EXPECTED_TARGET.repository}:${EXPECTED_TARGET.environment}`;
const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const manifestPath = resolve(scriptDir, "candidate-a-manifest.json");
const ghBin = process.env.SEALED_TRANSFER_GH_BIN ?? "gh";

function usage() {
  process.stderr.write(
    `usage: node apply.mjs <bundle.json> [--plan | --apply-to ${CONFIRMATION}]\n`
  );
}

function ghApi(args, input) {
  const result = spawnSync(ghBin, ["api", ...args], {
    encoding: "utf8",
    input,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(
      `gh api failed (${args.join(" ")}): ${result.stderr.trim()}`
    );
  }
  return result.stdout;
}

function listNames(endpoint) {
  const body = JSON.parse(ghApi([`${endpoint}?per_page=100`]));
  return new Set((body.secrets ?? []).map((secret) => secret.name));
}

function listVariables(endpoint) {
  const body = JSON.parse(ghApi([`${endpoint}?per_page=100`]));
  return new Map(
    (body.variables ?? []).map((variable) => [variable.name, variable.value])
  );
}

const [bundleArg, mode = "--plan", confirmation, ...extra] =
  process.argv.slice(2);
if (!bundleArg || extra.length > 0) {
  usage();
  process.exit(2);
}
const apply = mode === "--apply-to" && confirmation === CONFIRMATION;
if (mode !== "--plan" && !apply) {
  usage();
  process.exit(2);
}

const manifest = await loadManifest(manifestPath);
const bundle = JSON.parse(await readFile(resolve(bundleArg), "utf8"));
assertBundle(bundle, manifest);

const byClass = Map.groupBy(bundle.entries, (entry) => entry.authorityClass);
process.stdout.write(
  `validated ${bundle.entries.length}/${manifest.secrets.length} ciphertext entries for ${CONFIRMATION}\n`
);
for (const [authorityClass, entries] of [...byClass.entries()].sort()) {
  process.stdout.write(`  ${authorityClass}: ${entries.length}\n`);
}
process.stdout.write(
  "post-apply gate: OpenBao remains unchanged; verify fixed VM and DNS authority before control-plane cutover. GH_REPOS ingestion is tracked in bug.5052.\n"
);

if (!apply) {
  process.stdout.write(
    `plan only; no GitHub API calls made. Re-run with --apply-to ${CONFIRMATION} to mutate the fixed environment.\n`
  );
  process.exit(0);
}

const repo = EXPECTED_TARGET.repository;
const environment = EXPECTED_TARGET.environment;
const key = JSON.parse(
  ghApi([`repos/${repo}/environments/${environment}/secrets/public-key`])
);
if (
  key.key_id !== manifest.target.sealingKey.keyId ||
  key.key !== manifest.target.sealingKey.publicKey
) {
  throw new Error(
    "target environment public key differs from the reviewed manifest; rotation requires a reviewed manifest update and fresh export"
  );
}

const repoSecretsEndpoint = `repos/${repo}/actions/secrets`;
const environmentSecretsEndpoint = `repos/${repo}/environments/${environment}/secrets`;
const environmentVariablesEndpoint = `repos/${repo}/environments/${environment}/variables`;
const repositoryNamesBefore = listNames(repoSecretsEndpoint);
for (const name of manifest.targetRepositorySecretsToPreserve) {
  if (!repositoryNamesBefore.has(name)) {
    throw new Error(
      `required target repository-level secret is absent: ${name}`
    );
  }
}
const environmentNamesBefore = listNames(environmentSecretsEndpoint);
const environmentVariablesBefore = listVariables(environmentVariablesEndpoint);

for (const entry of bundle.entries) {
  const body = JSON.stringify({
    encrypted_value: entry.encryptedValue,
    key_id: bundle.targetKeyId,
  });
  ghApi(
    [
      "--method",
      "PUT",
      `${environmentSecretsEndpoint}/${encodeURIComponent(entry.name)}`,
      "--input",
      "-",
    ],
    body
  );
  process.stdout.write(`applied ${entry.name}\n`);
}

for (const variable of bundle.variables) {
  const existed = environmentVariablesBefore.has(variable.name);
  const endpoint = existed
    ? `${environmentVariablesEndpoint}/${encodeURIComponent(variable.name)}`
    : environmentVariablesEndpoint;
  ghApi(
    ["--method", existed ? "PATCH" : "POST", endpoint, "--input", "-"],
    JSON.stringify({ name: variable.name, value: variable.value })
  );
  process.stdout.write(`applied variable ${variable.name}\n`);
}

const repositoryNamesAfter = listNames(repoSecretsEndpoint);
if (
  repositoryNamesBefore.size !== repositoryNamesAfter.size ||
  [...repositoryNamesBefore].some((name) => !repositoryNamesAfter.has(name))
) {
  throw new Error(
    "target repository-level secret names changed during environment apply"
  );
}
const environmentNamesAfter = listNames(environmentSecretsEndpoint);
const expectedEnvironmentNames = new Set([
  ...environmentNamesBefore,
  ...bundle.entries.map((entry) => entry.name),
]);
if (
  environmentNamesAfter.size !== expectedEnvironmentNames.size ||
  [...expectedEnvironmentNames].some((name) => !environmentNamesAfter.has(name))
) {
  throw new Error("target environment secret name/count verification failed");
}
const environmentVariablesAfter = listVariables(environmentVariablesEndpoint);
const expectedVariableNames = new Set([
  ...environmentVariablesBefore.keys(),
  ...bundle.variables.map((variable) => variable.name),
]);
if (
  environmentVariablesAfter.size !== expectedVariableNames.size ||
  [...expectedVariableNames].some(
    (name) => !environmentVariablesAfter.has(name)
  )
) {
  throw new Error("target environment variable name/count verification failed");
}
for (const [name, value] of environmentVariablesBefore) {
  if (
    !bundle.variables.some((variable) => variable.name === name) &&
    environmentVariablesAfter.get(name) !== value
  ) {
    throw new Error(
      `unmanifested target environment variable changed: ${name}`
    );
  }
}
for (const variable of bundle.variables) {
  if (environmentVariablesAfter.get(variable.name) !== variable.value) {
    throw new Error(
      `source-to-target variable parity failed: ${variable.name}`
    );
  }
}

process.stdout.write(
  `verified ${environmentNamesAfter.size} target environment secret names and exact parity for ${bundle.variables.length} variables; ${repositoryNamesAfter.size} repository-level names were preserved\n`
);
