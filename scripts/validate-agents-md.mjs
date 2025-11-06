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

  // Warn about missing PR but don't fail
  if (!/\*\*Reviewed in PR:\*\*\s*(#\d+|TBD)/i.test(block)) {
    console.warn("Warning: Reviewed in PR field missing or invalid");
  }
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
    "shared",
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

function validate(file) {
  const md = readFileSync(file, "utf8");

  // 1) headings presence + order (core structure)
  const headings = h(md);
  let idx = -1;
  for (const req of REQ_HEADINGS) {
    const i = headings.indexOf(req);
    if (i === -1) throw new Error(`${file}: missing heading "${req}"`);
    if (i <= idx) throw new Error(`${file}: "${req}" out of order`);
    idx = i;
  }

  // 2) validate critical sections only
  validateMetadata(getBlockAfter(md, "Metadata"));
  validateBoundaries(getBlockAfter(md, "Boundaries"));

  // Optional scope line check (warn only)
  if (!/^> Scope: this directory only\./m.test(md)) {
    console.warn(`${file}: Warning - missing scope line`);
  }
}

// Find all AGENTS.md files except the root one (which has different format)
const files = await globby([
  "**/AGENTS.md",
  "!AGENTS.md",
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
