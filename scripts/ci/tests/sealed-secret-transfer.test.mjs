// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/ci/tests/sealed-secret-transfer`
 * Purpose: Prove fixed allowlists, sealed-box compatibility, plaintext exclusion, and target-only apply behavior.
 * Scope: Ephemeral keys and a fake gh binary only; does not read or mutate live GitHub state.
 * Invariants: FORBIDDEN_RUNTIME_NAMES_FAIL_CLOSED; PLAN_IS_NON_MUTATING; TARGET_EXTRAS_ARE_PRESERVED.
 * Side-effects: IO (ephemeral test files and child processes).
 * Links: task.5034, scripts/ci/sealed-secret-transfer/candidate-a-manifest.json
 * @internal
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertBundle,
  assertManifest,
  EXPECTED_SECRET_COUNT,
  loadManifest,
  sealSecretBundle,
} from "../sealed-secret-transfer/lib.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "../../..");
const sealedTransferRequire = createRequire(
  resolve(repoRoot, "scripts/ci/sealed-secret-transfer/package.json")
);
const sodium = sealedTransferRequire("libsodium-wrappers");
const manifestPath = resolve(
  repoRoot,
  "scripts/ci/sealed-secret-transfer/candidate-a-manifest.json"
);
const applyPath = resolve(
  repoRoot,
  "scripts/ci/sealed-secret-transfer/apply.mjs"
);

async function fixture() {
  await sodium.ready;
  const manifest = await loadManifest(manifestPath);
  const sourceSecrets = Object.fromEntries(
    manifest.secrets.map(({ name }) => [name, `fixture-plaintext-${name}`])
  );
  const sourceVariables = Object.fromEntries(
    manifest.variables.map(({ name }) => [name, `fixture-config-${name}`])
  );
  const bundle = await sealSecretBundle({
    manifest,
    sourceSecrets,
    sourceVariables,
    generatedAt: "2026-08-18T00:00:00.000Z",
  });
  return { manifest, sourceSecrets, sourceVariables, bundle };
}

test("manifest is the minimal fixed candidate flight authority contract", async () => {
  const manifest = await loadManifest(manifestPath);
  assert.equal(manifest.secrets.length, EXPECTED_SECRET_COUNT);
  assert.deepEqual(manifest.source, {
    repository: "cogni-dao/cogni",
    environment: "candidate-a",
  });
  assert.deepEqual(manifest.target, {
    repository: "cogni-test-org/cogni-monorepo",
    environment: "candidate-a",
    sealingKey: {
      keyId: "3380204578043523366",
      publicKey: "Yz2aKzjBsoTVDUdGUFoiPRa1gPp/OpHRVtMGGSXOVgE=",
    },
  });
  assert.deepEqual(manifest.targetRepositorySecretsToPreserve, [
    "ACTIONS_AUTOMATION_BOT_PAT",
    "GHCR_DEPLOY_TOKEN",
    "GHCR_DEPLOY_USERNAME",
  ]);
  assert.deepEqual(
    manifest.variables.map(({ name }) => name),
    ["DOMAIN"]
  );
  assert.deepEqual(
    manifest.secrets.map(({ name }) => name),
    ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID", "SSH_DEPLOY_KEY", "VM_HOST"]
  );
});

test("OpenBao/runtime and repo-level names cannot enter the bundle", async () => {
  const manifest = await loadManifest(manifestPath);
  const forbidden = [
    "APP_DB_PASSWORD",
    "AUTH_SECRET",
    "DATABASE_URL",
    "INTERNAL_OPS_TOKEN",
    "LITELLM_MASTER_KEY",
    "GH_REVIEW_APP_PRIVATE_KEY_BASE64",
    "GRAFANA_CLOUD_LOKI_API_KEY",
    "GIT_READ_TOKEN",
    "GHCR_DEPLOY_TOKEN",
  ];
  const names = new Set(manifest.secrets.map(({ name }) => name));
  for (const name of forbidden) assert.equal(names.has(name), false, name);

  for (const name of forbidden) {
    const drifted = structuredClone(manifest);
    drifted.secrets[0] = {
      name,
      authorityClass: "openbao-runtime",
    };
    assert.throws(
      () => assertManifest(drifted),
      /exact candidate flight 4-name set/
    );
  }
});

test("workflow binds only the manifested secrets and variables explicitly", async () => {
  const manifest = await loadManifest(manifestPath);
  const workflow = await readFile(
    resolve(repoRoot, ".github/workflows/candidate-a-sealed-secret-export.yml"),
    "utf8"
  );
  assert.equal(workflow.includes("toJSON(secrets)"), false);
  assert.equal(workflow.includes("toJSON(vars)"), false);
  assert.equal(workflow.includes("target_public_key"), false);
  assert.equal(workflow.includes("target_key_id"), false);
  assert.equal(workflow.includes("TARGET_PUBLIC_KEY"), false);
  assert.equal(workflow.includes("TARGET_KEY_ID"), false);
  assert.equal(workflow.includes("github.event.inputs"), false);
  assert.match(workflow, /retention-days: 1/);
  const dispatchBlock = workflow.match(
    /workflow_dispatch:\n\s+inputs:\n(?<inputs>[\s\S]*?)\n\npermissions:/
  )?.groups?.inputs;
  assert.ok(dispatchBlock);
  assert.deepEqual(
    [...dispatchBlock.matchAll(/^ {6}([a-z0-9_]+):$/gm)].map(
      (match) => match[1]
    ),
    ["confirmation"]
  );
  assert.deepEqual(
    [...workflow.matchAll(/\$\{\{\s*inputs\.([a-z0-9_]+)\s*\}\}/g)].map(
      (match) => match[1]
    ),
    ["confirmation"]
  );
  assert.match(
    workflow,
    /if \[ "\$GITHUB_REPOSITORY" != "cogni-dao\/cogni" \]/
  );
  assert.match(workflow, /if \[ "\$GITHUB_REF_NAME" != "main" \]/);
  assert.match(
    workflow,
    /actions\/checkout@[a-f0-9]+[^\n]*\n\s+with:\n\s+ref: main/
  );
  assert.match(workflow, /checked_out_sha=\$\(git rev-parse HEAD\)/);
  assert.match(workflow, /if \[ "\$checked_out_sha" != "\$GITHUB_SHA" \]/);

  const sealer = await readFile(
    resolve(repoRoot, "scripts/ci/sealed-secret-transfer/seal.mjs"),
    "utf8"
  );
  assert.equal(sealer.includes("TARGET_PUBLIC_KEY"), false);
  assert.equal(sealer.includes("TARGET_KEY_ID"), false);

  const secretBindings = [
    ...workflow.matchAll(
      /^\s+SOURCE_SECRET_([A-Z0-9_]+): \$\{\{ secrets\.([A-Z0-9_]+) \}\}$/gm
    ),
  ].map((match) => [match[1], match[2]]);
  assert.deepEqual(
    secretBindings,
    manifest.secrets.map(({ name }) => [name, name])
  );

  const variableBindings = [
    ...workflow.matchAll(
      /^\s+SOURCE_VARIABLE_([A-Z0-9_]+): \$\{\{ vars\.([A-Z0-9_]+) \}\}$/gm
    ),
  ].map((match) => [match[1], match[2]]);
  assert.deepEqual(
    variableBindings,
    manifest.variables.map(({ name }) => [name, name])
  );

  const candidateFlight = await readFile(
    resolve(repoRoot, ".github/workflows/candidate-flight.yml"),
    "utf8"
  );
  for (const { name } of manifest.secrets) {
    assert.match(candidateFlight, new RegExp(`secrets\\.${name}\\b`));
  }
  assert.match(candidateFlight, /vars\.DOMAIN\b/);
});

test("every value is a GitHub-compatible sealed box and no plaintext is serialized", async () => {
  const { manifest, sourceSecrets, bundle } = await fixture();
  assertBundle(bundle, manifest);
  assert.equal(bundle.entries.length, EXPECTED_SECRET_COUNT);
  assert.deepEqual(bundle.missing, []);

  const serialized = JSON.stringify(bundle);
  for (const [name, plaintext] of Object.entries(sourceSecrets)) {
    assert.equal(
      serialized.includes(plaintext),
      false,
      `${name} leaked plaintext`
    );
  }

  for (const entry of bundle.entries) {
    const ciphertext = sodium.from_base64(
      entry.encryptedValue,
      sodium.base64_variants.ORIGINAL
    );
    assert.equal(
      ciphertext.length,
      sodium.crypto_box_SEALBYTES +
        sodium.from_string(sourceSecrets[entry.name]).length
    );
  }

  const keys = sodium.crypto_box_keypair();
  const message = sodium.from_string("sealed-box-compatibility-fixture");
  const ciphertext = sodium.crypto_box_seal(message, keys.publicKey);
  const opened = sodium.crypto_box_seal_open(
    ciphertext,
    keys.publicKey,
    keys.privateKey
  );
  assert.equal(sodium.to_string(opened), "sealed-box-compatibility-fixture");
});

test("incomplete source and manifest drift fail closed", async () => {
  const { manifest, sourceSecrets } = await fixture();
  delete sourceSecrets.VM_HOST;
  const incomplete = await sealSecretBundle({
    manifest,
    sourceSecrets,
    sourceVariables: Object.fromEntries(
      manifest.variables.map(({ name }) => [name, `fixture-config-${name}`])
    ),
  });
  assert.throws(() => assertBundle(incomplete, manifest), /incomplete/);

  const drifted = structuredClone(incomplete);
  drifted.manifestSha256 = "0".repeat(64);
  assert.throws(
    () => assertBundle(drifted, manifest, { requireComplete: false }),
    /digest/
  );
});

test("apply is plan-only by default and fixed-target apply preserves repo names", async () => {
  const { manifest, bundle } = await fixture();
  const root = await mkdtemp(resolve(tmpdir(), "sealed-transfer-"));
  const bundlePath = resolve(root, "bundle.json");
  const shimPath = resolve(root, "gh-shim.sh");
  const statePath = resolve(root, "environment-names.txt");
  const variablesPath = resolve(root, "environment-variables.json");
  await writeFile(bundlePath, `${JSON.stringify(bundle)}\n`, { mode: 0o600 });
  await writeFile(statePath, "PREEXISTING_TARGET_ONLY\n");
  await writeFile(
    variablesPath,
    '{"UNMANIFESTED_TARGET_ONLY":"preserve-me"}\n'
  );
  await writeFile(
    shimPath,
    `#!/usr/bin/env bash
set -euo pipefail
endpoint=""
method="GET"
for ((i=1; i<=$#; i++)); do
  arg="\${!i}"
  if [[ "$arg" == "--method" ]]; then
    j=$((i + 1)); method="\${!j}"
  elif [[ "$arg" == repos/* ]]; then
    endpoint="$arg"
  fi
done
endpoint="\${endpoint%%\\?*}"
if [[ "$endpoint" == */secrets/public-key ]]; then
  printf '{"key_id":"%s","key":"%s"}\\n' "$SEALED_TRANSFER_TEST_KEY_ID" "$SEALED_TRANSFER_TEST_PUBLIC_KEY"
elif [[ "$endpoint" == "repos/cogni-test-org/cogni-monorepo/actions/secrets" ]]; then
  printf '{"secrets":[{"name":"ACTIONS_AUTOMATION_BOT_PAT"},{"name":"GHCR_DEPLOY_TOKEN"},{"name":"GHCR_DEPLOY_USERNAME"}]}\\n'
elif [[ "$method" == "PUT" ]]; then
  cat >/dev/null
  basename "$endpoint" >>"$SEALED_TRANSFER_TEST_STATE"
  printf '{}\\n'
elif [[ "$endpoint" == "repos/cogni-test-org/cogni-monorepo/environments/candidate-a/secrets" ]]; then
  jq -Rn '[inputs | select(length > 0) | {name: .}] | {secrets: .}' <"$SEALED_TRANSFER_TEST_STATE"
elif [[ "$endpoint" == "repos/cogni-test-org/cogni-monorepo/environments/candidate-a/variables" && "$method" == "POST" ]]; then
  body=$(cat)
  name=$(jq -r .name <<<"$body"); value=$(jq -r .value <<<"$body")
  jq --arg name "$name" --arg value "$value" '.[$name] = $value' "$SEALED_TRANSFER_TEST_VARIABLES" >"$SEALED_TRANSFER_TEST_VARIABLES.tmp"
  mv "$SEALED_TRANSFER_TEST_VARIABLES.tmp" "$SEALED_TRANSFER_TEST_VARIABLES"
  printf '{}\\n'
elif [[ "$endpoint" == repos/cogni-test-org/cogni-monorepo/environments/candidate-a/variables/* && "$method" == "PATCH" ]]; then
  body=$(cat)
  name=$(jq -r .name <<<"$body"); value=$(jq -r .value <<<"$body")
  jq --arg name "$name" --arg value "$value" '.[$name] = $value' "$SEALED_TRANSFER_TEST_VARIABLES" >"$SEALED_TRANSFER_TEST_VARIABLES.tmp"
  mv "$SEALED_TRANSFER_TEST_VARIABLES.tmp" "$SEALED_TRANSFER_TEST_VARIABLES"
  printf '{}\\n'
elif [[ "$endpoint" == "repos/cogni-test-org/cogni-monorepo/environments/candidate-a/variables" ]]; then
  jq '{variables: to_entries | map({name: .key, value: .value})}' "$SEALED_TRANSFER_TEST_VARIABLES"
else
  printf 'unexpected endpoint: %s\\n' "$endpoint" >&2
  exit 3
fi
`,
    { mode: 0o700 }
  );
  await chmod(shimPath, 0o700);

  const plan = spawnSync(process.execPath, [applyPath, bundlePath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, SEALED_TRANSFER_GH_BIN: "/does/not/exist" },
  });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /plan only; no GitHub API calls made/);

  const rotatedKeyApply = spawnSync(
    process.execPath,
    [
      applyPath,
      bundlePath,
      "--apply-to",
      "cogni-test-org/cogni-monorepo:candidate-a",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        SEALED_TRANSFER_GH_BIN: shimPath,
        SEALED_TRANSFER_TEST_KEY_ID: "rotated-key-id",
        SEALED_TRANSFER_TEST_PUBLIC_KEY: "rotated-public-key",
        SEALED_TRANSFER_TEST_STATE: statePath,
        SEALED_TRANSFER_TEST_VARIABLES: variablesPath,
      },
    }
  );
  assert.notEqual(rotatedKeyApply.status, 0);
  assert.match(rotatedKeyApply.stderr, /requires a reviewed manifest update/);
  assert.equal(await readFile(statePath, "utf8"), "PREEXISTING_TARGET_ONLY\n");

  const apply = spawnSync(
    process.execPath,
    [
      applyPath,
      bundlePath,
      "--apply-to",
      "cogni-test-org/cogni-monorepo:candidate-a",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        SEALED_TRANSFER_GH_BIN: shimPath,
        SEALED_TRANSFER_TEST_KEY_ID: manifest.target.sealingKey.keyId,
        SEALED_TRANSFER_TEST_PUBLIC_KEY: manifest.target.sealingKey.publicKey,
        SEALED_TRANSFER_TEST_STATE: statePath,
        SEALED_TRANSFER_TEST_VARIABLES: variablesPath,
      },
    }
  );
  assert.equal(apply.status, 0, apply.stderr);
  assert.match(
    apply.stdout,
    /verified 5 target environment secret names and exact parity for 1 variables/
  );
  const names = (await readFile(statePath, "utf8")).trim().split("\n");
  assert.equal(new Set(names).size, 5);
  assert.equal(names.includes("PREEXISTING_TARGET_ONLY"), true);
  const variables = JSON.parse(await readFile(variablesPath, "utf8"));
  assert.equal(variables.UNMANIFESTED_TARGET_ONLY, "preserve-me");
  assert.equal(variables.DOMAIN, "fixture-config-DOMAIN");
});
