#!/usr/bin/env node
/* eslint-env node */
import { readFileSync } from "node:fs";

import { globby } from "globby";

const REQ_HEADINGS = [
  "Metadata",
  "Purpose",
  "Pointers",
  "Boundaries",
  "Public Surface",
  "Ports (optional)",
  "Responsibilities",
  "Usage",
  "Standards",
  "Dependencies",
  "Change Protocol",
  "Notes",
];

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
  if (!/\*\*Owners:\*\*\s*@\w+/i.test(block))
    throw new Error("Metadata: missing Owner");
  const date = block.match(/\*\*Last reviewed:\*\*\s*([0-9-]+)/i)?.[1] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Metadata: invalid date");
  if (!/\*\*Status:\*\*\s*(stable|draft|deprecated)/i.test(block))
    throw new Error("Metadata: invalid Status");
}

function validateBoundaries(block) {
  const m = block.match(/```json\s*([\s\S]*?)```/);
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
    "adapters/server",
    "adapters/worker",
    "adapters/cli",
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
  ];

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

  // 2) validate critical sections only
  validateMetadata(getBlockAfter(content, "Metadata"));
  validateBoundaries(getBlockAfter(content, "Boundaries"));

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
const files = await globby([
  "**/AGENTS.md",
  "AGENTS.md",
  "!**/node_modules/**",
]);
for (const f of files) {
  try {
    validate(f);
  } catch (e) {
    console.error(`${f}: ${e.message}`);
    process.exit(1);
  }
}
console.log("AGENTS.md OK");
