/**
 * Module: scripts/validate-package-declarations.ts
 * Purpose: Validates that all workspace packages have declaration files after tsc -b.
 * Usage: pnpm packages:validate (called automatically by packages:build)
 *
 * Data-driven: Discovers packages from tsconfig.json references, reads each
 * package.json's exports["."].types to find expected declaration path.
 * No hardcoded package names.
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
