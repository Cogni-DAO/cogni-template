// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/validate-package-declarations`
 * Purpose: Validates that all workspace packages have declaration files after tsc -b.
 * Scope: Build/CI-time guard; discovers packages from tsconfig.json references and verifies declaration files exist. Does not validate declaration contents or type correctness.
 * Invariants: All workspace packages must have exports["."].types or types field in package.json pointing to existing .d.ts files.
 * Side-effects: IO (reads tsconfig.json and package.json files); terminates process on validation failure.
 * Links: tsconfig.json, packages/{pkg}/package.json
 * @public
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

interface TsConfigReference {
  path: string;
}

interface TsConfig {
  references?: TsConfigReference[];
}

interface PackageExports {
  "."?: {
    types?: string;
  };
}

interface PackageJson {
  name: string;
  exports?: PackageExports;
  types?: string;
}

function main(): void {
  const rootDir = process.cwd();
  const tsconfigPath = resolve(rootDir, "tsconfig.json");

  // Read tsconfig.json to get package references
  const tsconfig: TsConfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  const refs = tsconfig.references ?? [];

  if (refs.length === 0) {
    console.log("No package references found in tsconfig.json");
    return;
  }

  let failed = false;

  for (const ref of refs) {
    const pkgDir = resolve(rootDir, ref.path);
    const pkgJsonPath = resolve(pkgDir, "package.json");

    if (!existsSync(pkgJsonPath)) {
      console.error(`✗ ${ref.path}: package.json not found`);
      failed = true;
      continue;
    }

    const pkgJson: PackageJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));

    // Get types export path (prefer exports["."].types, fallback to types)
    const typesPath = pkgJson.exports?.["."]?.types ?? pkgJson.types;

    if (!typesPath) {
      console.error(`✗ ${ref.path}: No types export defined in package.json`);
      failed = true;
      continue;
    }

    const fullTypesPath = resolve(pkgDir, typesPath);

    if (!existsSync(fullTypesPath)) {
      console.error(`✗ ${ref.path}: Missing ${typesPath}`);
      failed = true;
    } else {
      console.log(`✓ ${ref.path}: ${typesPath}`);
    }
  }

  if (failed) {
    console.error(
      "\nDeclaration validation failed. Run 'tsc -b' to generate declarations."
    );
    process.exit(1);
  }

  console.log(`\n✓ All ${refs.length} packages have declarations`);
}

main();
