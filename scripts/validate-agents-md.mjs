#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/validate-agents-md`
 * Purpose: Validates AGENTS.md file structure and required sections across all directories.
 * Scope: Enforces heading requirements, metadata format, line limits. Does NOT validate content accuracy.
 * Invariants: All AGENTS.md files must have required headings; stay under 150 lines; valid metadata format.
 * Side-effects: IO
 * Notes: Exits with error code if validation fails; supports CI/CD pipeline integration.
 * Links: docs/templates/agents_subdir_template.md
 * @public
 */

/* eslint-env node */
import { readFileSync } from "node:fs";

import fg from "fast-glob";

const REQ_HEADINGS = [
  "Metadata",
  "Purpose",
  "Pointers",
  "Boundaries",
  "Public Surface",
  "Responsibilities",
  "Usage",
  "Standards",
  "Dependencies",
  "Change Protocol",
  "Notes",
];

const OPTIONAL_HEADINGS = ["Ports (optional)"];

const ROOT_REQ_HEADINGS = [
  "Mission",
  "Workflow Guiding Principles",
  "Agent Behavior",
  "Environment",
  "Pointers",
  "Usage",
];

const PROHIBITED_WORDS = [
  "complete",
  "comprehensive",
  "final",
  "production ready",
];

function h(md) {
  return [...md.matchAll(/^#{2}\s+(.+?)\s*$/gm)].map((m) => m[1].trim());
}
function getBlockAfter(md, heading) {
  const idx = md.indexOf(`## ${heading}`);
  if (idx === -1) return "";
  const slice = md.slice(idx);
  const next = slice.indexOf("\n## ");
  return next === -1 ? slice : slice.slice(0, next);
}

function validateMetadata(block) {
  if (
    !/\*\*Owners:\*\*\s*@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9-]*)?/m.test(
      block
    )
  )
    throw new Error("Metadata: missing Owner");
  const date = block.match(/\*\*Last reviewed:\*\*\s*([0-9-]+)/i)?.[1] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Metadata: invalid date");
  if (!/\*\*Status:\*\*\s*(stable|draft|deprecated)/i.test(block))
    throw new Error("Metadata: invalid Status");
}

function validateBoundaries(block, filePathRaw) {
  const filePath = filePathRaw.replace(/\\/g, "/");
  const m = block.match(/```json[c5]?\s*([\s\S]*?)```/i);
  if (!m) throw new Error("Boundaries: missing JSON block");
  let j;
  try {
    j = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`Boundaries: invalid JSON (${e.message})`);
  }

  const VALID_LAYERS = [
    "app",
    "features",
    "ports",
    "core",
    "adapters",
    "adapters/server",
    "adapters/worker",
    "adapters/cli",
    "adapters/test",
    "contracts",
    "mcp",
    "shared",
    "types",
    "bootstrap",
    "components",
    "styles",
    "assets",
    "tests",
    "e2e",
    "scripts",
    "infra",
    "meta",
    "packages",
    "services",
  ];

  // Map dirs to canonical layer and allowed imports (must match ESLint)
  const LAYER_FROM_PATH = [
    { re: /^src\/app\//, layer: "app" },
    { re: /^src\/features\//, layer: "features" },
    { re: /^src\/ports\//, layer: "ports" },
    { re: /^src\/core\//, layer: "core" },
    { re: /^src\/adapters\/AGENTS\.md$/, layer: "adapters" },
    { re: /^src\/adapters\/server\//, layer: "adapters/server" },
    { re: /^src\/adapters\/worker\//, layer: "adapters/worker" },
    { re: /^src\/adapters\/cli\//, layer: "adapters/cli" },
    { re: /^src\/adapters\/test\//, layer: "adapters/test" },
    { re: /^src\/contracts\//, layer: "contracts" },
    { re: /^src\/mcp\//, layer: "mcp" },
    { re: /^src\/shared\//, layer: "shared" },
    { re: /^src\/bootstrap\//, layer: "bootstrap" },
    { re: /^src\/components\//, layer: "components" },
    { re: /^src\/styles\//, layer: "styles" },
    { re: /^src\/types\//, layer: "types" },
    { re: /^src\/assets\//, layer: "assets" },
    { re: /^tests\//, layer: "tests" },
    { re: /^e2e\//, layer: "e2e" },
    { re: /^scripts\//, layer: "scripts" },
    { re: /^infra\//, layer: "infra" },
    { re: /^platform\//, layer: "infra" },
    { re: /^packages\//, layer: "packages" },
    { re: /^services\//, layer: "services" },
  ];

  const POLICY_ALLOW = {
    core: ["core", "types"],
    ports: ["ports", "core", "types"],
    features: [
      "features",
      "ports",
      "core",
      "shared",
      "types",
      "components",
      "contracts",
    ],
    contracts: ["contracts", "shared", "types"],
    app: [
      "app",
      "features",
      "ports",
      "shared",
      "contracts",
      "types",
      "components",
      "styles",
      "bootstrap",
    ],
    mcp: ["mcp", "features", "ports", "contracts", "bootstrap"],
    adapters: ["adapters", "ports", "shared", "types"],
    "adapters/server": ["adapters/server", "ports", "shared", "types"],
    "adapters/worker": ["adapters/worker", "ports", "shared", "types"],
    "adapters/cli": ["adapters/cli", "ports", "shared", "types"],
    "adapters/test": ["adapters/test", "ports", "shared", "types"],
    shared: ["shared", "types"],
    bootstrap: [
      "bootstrap",
      "ports",
      "adapters/server",
      "adapters/worker",
      "adapters/cli",
      "adapters/test",
      "shared",
      "types",
    ],
    components: ["components", "shared", "types", "styles"],
    styles: ["styles"],
    types: ["types"],
    assets: ["assets"],
    tests: ["*"],
    e2e: ["*"],
    scripts: ["scripts", "ports", "shared", "types"],
    infra: ["infra"], // doc-only
    meta: ["meta"], // doc-only
    // Monorepo packages: isolated, no src/services imports (external deps only)
    packages: ["packages"],
    // Services: can use shared packages, no src imports
    services: ["services", "packages"],
  };

  if (!VALID_LAYERS.includes(j.layer))
    throw new Error("Boundaries: invalid layer");
  if (!Array.isArray(j.may_import) || !Array.isArray(j.must_not_import)) {
    throw new Error(
      "Boundaries: may_import and must_not_import must be arrays"
    );
  }

  // Normalize and dedupe arrays
  j.may_import = [...new Set(j.may_import.map(String))];
  j.must_not_import = [...new Set(j.must_not_import.map(String))];

  // Warn if may_import is empty (unless fully isolated with must_not_import: ["*"])
  if (
    j.may_import.length === 0 &&
    !(j.must_not_import.length === 1 && j.must_not_import[0] === "*")
  ) {
    console.warn(`Warning: may_import is empty - this is probably a mistake`);
  }

  // Validate imports are subsets of valid layers (allow wildcards like "*")
  const invalidMayImport = j.may_import.filter(
    (layer) => layer !== "*" && !VALID_LAYERS.includes(layer)
  );
  if (invalidMayImport.length > 0) {
    throw new Error(
      `Boundaries: invalid layers in may_import: ${invalidMayImport.join(", ")}`
    );
  }

  const invalidMustNotImport = j.must_not_import.filter(
    (layer) => layer !== "*" && !VALID_LAYERS.includes(layer)
  );
  if (invalidMustNotImport.length > 0) {
    throw new Error(
      `Boundaries: invalid layers in must_not_import: ${invalidMustNotImport.join(", ")}`
    );
  }

  // Validate no overlap between may_import and must_not_import
  const overlap = j.may_import.filter((layer) =>
    j.must_not_import.includes(layer)
  );
  if (overlap.length > 0) {
    throw new Error(
      `Boundaries: overlap between may_import and must_not_import: ${overlap.join(", ")}`
    );
  }

  // 4) Path ↔ declared layer consistency
  const guessed = LAYER_FROM_PATH.find((m) => m.re.test(filePath))?.layer;
  if (guessed && guessed !== j.layer) {
    throw new Error(
      `Boundaries: layer "${j.layer}" does not match path "${guessed}"`
    );
  }

  // 5) Declared may_import must be subset of policy for this layer
  const policy = POLICY_ALLOW[j.layer];
  if (policy) {
    // If the policy contains "*", allow any explicit list in the doc.
    if (policy.includes("*")) {
      return; // accept any may_import for this layer
    }
    const extras = j.may_import.filter((x) => {
      if (x === "*" || policy.includes(x)) return false;
      // Handle "adapters" wildcard in policy matching "adapters/server", etc.
      if (x.startsWith("adapters/") && policy.includes("adapters"))
        return false;
      return true;
    });
    if (extras.length) {
      throw new Error(
        `Boundaries: may_import includes layers not allowed by policy for "${j.layer}": ${extras.join(", ")}`
      );
    }
  }

  // 6) Contracts edge-only explicit guard
  if (j.layer === "contracts") {
    const banned = ["features", "ports", "core"];
    if (j.may_import.some((x) => banned.includes(x))) {
      throw new Error(
        `Boundaries: contracts may not import ${banned.join("|")}`
      );
    }
  }

  // 7) src/** layers may not import platform/** (CI/IaC not runtime dependency)
  if (
    filePath.startsWith("src/") &&
    j.may_import.some((x) => x === "platform" || x.startsWith("platform/"))
  ) {
    throw new Error(
      `Boundaries: src layers cannot import platform/** (CI/IaC not runtime dependency)`
    );
  }
}

function validateRootAgents(file, content) {
  // 1. Check required headings (no order enforcement for root)
  const headings = h(content);
  for (const req of ROOT_REQ_HEADINGS) {
    if (!headings.includes(req)) {
      throw new Error(`${file}: missing heading "${req}"`);
    }
  }

  // 2. Validate scope line for root
  if (!/^> Scope: repository-wide/m.test(content)) {
    console.warn(`${file}: Warning - missing or incorrect scope line`);
  }

  // 3. Basic Usage section validation (check for pnpm commands)
  const usageBlock = getBlockAfter(content, "Usage");
  if (!/pnpm check/m.test(usageBlock)) {
    console.warn(
      `${file}: Warning - Usage section missing 'pnpm check' command`
    );
  }

  // 4. Check for prohibited words
  validateProhibitedWords(file, content);
}

function validateProhibitedWords(file, content) {
  for (const word of PROHIBITED_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(content)) {
      throw new Error(
        `${file}: prohibited word "${word}" found - these words are red flags and indicate improper understanding`
      );
    }
  }
}

function validateSubdirAgents(file, content) {
  // 1) headings presence + order (core structure)
  const headings = h(content);
  let idx = -1;
  for (const req of REQ_HEADINGS) {
    const i = headings.indexOf(req);
    if (i === -1) throw new Error(`${file}: missing heading "${req}"`);
    if (i <= idx) throw new Error(`${file}: "${req}" out of order`);
    idx = i;
  }

  // Check optional headings for proper positioning
  for (const opt of OPTIONAL_HEADINGS) {
    const i = headings.indexOf(opt);
    if (i !== -1) {
      // "Ports (optional)" should come after "Public Surface" (index 4 in REQ_HEADINGS)
      const publicSurfaceIdx = headings.indexOf("Public Surface");
      const responsibilitiesIdx = headings.indexOf("Responsibilities");
      if (i <= publicSurfaceIdx || i >= responsibilitiesIdx) {
        throw new Error(`${file}: "${opt}" out of order`);
      }
    }
  }

  // 2) validate critical sections only
  validateMetadata(getBlockAfter(content, "Metadata"));
  validateBoundaries(getBlockAfter(content, "Boundaries"), file);

  // 3) check for prohibited words
  validateProhibitedWords(file, content);

  // Enforce scope line strictly for subdirs
  if (!/^> Scope: this directory only\./m.test(content)) {
    throw new Error(
      `${file}: missing required scope line '> Scope: this directory only.'`
    );
  }
}

function validate(file) {
  const md = readFileSync(file, "utf8");

  // Route to appropriate validator based on file location
  if (file === "AGENTS.md") {
    validateRootAgents(file, md);
  } else {
    validateSubdirAgents(file, md);
  }
}

// Find all AGENTS.md files including the root one
const files = await fg(["**/AGENTS.md", "AGENTS.md", "!**/node_modules/**"]);
for (const f of files) {
  try {
    validate(f);
  } catch (e) {
    console.error(`${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log("AGENTS.md OK");
