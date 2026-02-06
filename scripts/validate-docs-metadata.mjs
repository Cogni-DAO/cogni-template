#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/validate-docs-metadata`
 * Purpose: Validates Obsidian-style YAML frontmatter in /docs and /work directories.
 * Scope: Enforces field requirements, enums, date format, field set separation, and required H2 headings; does NOT validate prose content or cross-references.
 * Invariants: /docs uses id/type/status/trust; /work uses work_item_id/work_item_type/state; no wikilinks.
 * Side-effects: IO
 * Notes: Uses `yaml` package for proper YAML parsing. Exits with error code if validation fails.
 * Links: docs/DOCS_ORGANIZATION_PLAN.md
 * @public
 */

import { readFileSync } from "node:fs";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";

// === DOCS ENUMS ===
const DOC_TYPES = ["spec", "adr", "guide", "research", "postmortem"];
const DOC_STATUS = ["active", "deprecated", "superseded", "draft"];
const DOC_TRUST = ["canonical", "reviewed", "draft", "external"];
const ADR_DECISION = ["proposed", "accepted", "deprecated", "superseded"];

// === WORK ENUMS ===
const INITIATIVE_STATE = ["Active", "Paused", "Done", "Dropped"];
const ISSUE_STATE = ["Backlog", "Todo", "In Progress", "Done", "Cancelled"];
const PRIORITY = [0, 1, 2, 3];
const ESTIMATE = [0, 1, 2, 3, 4, 5];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// === REQUIRED H2 HEADINGS (per doc type) ===
// Spec headings gated on spec_state being present (exempts legacy specs and indexes)
const SPEC_REQUIRED_HEADINGS = [
  "Context",
  "Goal",
  "Non-Goals",
  "Core Invariants",
  "Design",
  "Acceptance Checks",
];
const ADR_REQUIRED_HEADINGS = ["Decision", "Rationale", "Consequences"];
const INITIATIVE_REQUIRED_HEADINGS = [
  "Goal",
  "Roadmap",
  "Constraints",
  "Dependencies",
  "As-Built Specs",
  "Design Notes",
];
const ISSUE_REQUIRED_HEADINGS = ["Execution Checklist", "Validation"];

// === REQUIRED KEYS ===
const DOC_REQUIRED = [
  "id",
  "type",
  "title",
  "status",
  "trust",
  "summary",
  "read_when",
  "owner",
  "created",
];
const INITIATIVE_REQUIRED = [
  "work_item_id",
  "work_item_type",
  "title",
  "state",
  "priority",
  "estimate",
  "summary",
  "outcome",
  "assignees",
  "created",
  "updated",
];
const ISSUE_REQUIRED = [
  "work_item_id",
  "work_item_type",
  "title",
  "state",
  "priority",
  "estimate",
  "summary",
  "outcome",
  "assignees",
  "initiative",
  "created",
  "updated",
];

// === FORBIDDEN FIELDS ===
const DOCS_FORBIDDEN = ["work_item_id", "work_item_type", "state", "outcome"];
const WORK_FORBIDDEN = ["id", "type", "status", "trust", "read_when"];

// === YAML FRONTMATTER PARSER ===
function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("missing YAML frontmatter (expected --- delimiters)");
  }
  const props = parseYaml(match[1]);
  if (!props || typeof props !== "object") {
    throw new Error("invalid YAML frontmatter (expected object)");
  }
  return props;
}

// === FORBIDDEN PATTERNS ===
function checkForbidden(content) {
  const errors = [];
  if (/\[\[.+?\]\]/.test(content)) {
    errors.push("wikilinks forbidden (use markdown links)");
  }
  return errors;
}

// === FIELD SET SEPARATION ===
function checkFieldSetSeparation(props, isWork) {
  const errors = [];
  const forbidden = isWork ? WORK_FORBIDDEN : DOCS_FORBIDDEN;
  const tree = isWork ? "/work" : "/docs";
  for (const key of forbidden) {
    if (props[key] !== undefined) {
      errors.push(`field "${key}" forbidden in ${tree} (wrong field set)`);
    }
  }
  return errors;
}

// === HEADING VALIDATION ===
function extractH2Headings(content) {
  return [...content.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1].trim());
}

function checkRequiredHeadings(content, requiredHeadings) {
  const actual = extractH2Headings(content);
  const errors = [];
  for (const req of requiredHeadings) {
    if (!actual.includes(req)) {
      errors.push(`missing required heading: ## ${req}`);
    }
  }
  return errors;
}

// === VALIDATORS ===
function validateDoc(file, props, content, allIds) {
  const errors = [];

  for (const key of DOC_REQUIRED) {
    if (props[key] === undefined || props[key] === null || props[key] === "") {
      errors.push(`missing required key: ${key}`);
    }
  }

  if (props.status !== "draft" && !props.verified) {
    errors.push(`verified required when status != draft`);
  }

  if (props.type && !DOC_TYPES.includes(props.type)) {
    errors.push(`invalid type: ${props.type}`);
  }
  if (props.status && !DOC_STATUS.includes(props.status)) {
    errors.push(`invalid status: ${props.status}`);
  }
  if (props.trust && !DOC_TRUST.includes(props.trust)) {
    errors.push(`invalid trust: ${props.trust}`);
  }
  if (
    props.type === "adr" &&
    props.decision &&
    !ADR_DECISION.includes(props.decision)
  ) {
    errors.push(`invalid decision: ${props.decision}`);
  }

  const created = String(props.created || "");
  const verified = String(props.verified || "");
  if (props.created && !DATE_REGEX.test(created)) {
    errors.push(`invalid created date: ${props.created}`);
  }
  if (props.verified && !DATE_REGEX.test(verified)) {
    errors.push(`invalid verified date: ${props.verified}`);
  }

  // Type must match directory
  const dirMatch = file.match(/docs\/([^/]+)\//);
  const dirType = dirMatch?.[1];
  const dirTypeMap = {
    spec: "spec",
    guides: "guide",
    decisions: "adr",
    research: "research",
    postmortems: "postmortem",
  };
  const expectedType = dirTypeMap[dirType];
  if (expectedType && props.type && expectedType !== props.type) {
    errors.push(
      `type "${props.type}" does not match directory "${dirType}" (expected "${expectedType}")`
    );
  }

  if (props.id) {
    if (allIds.has(props.id)) {
      errors.push(
        `duplicate id: ${props.id} (also in ${allIds.get(props.id)})`
      );
    } else {
      allIds.set(props.id, file);
    }
  }

  errors.push(...checkFieldSetSeparation(props, false));

  // Heading checks (spec gated on spec_state; ADR always)
  if (props.type === "spec" && props.spec_state) {
    errors.push(...checkRequiredHeadings(content, SPEC_REQUIRED_HEADINGS));
  }
  if (props.type === "adr") {
    errors.push(...checkRequiredHeadings(content, ADR_REQUIRED_HEADINGS));
  }

  return errors;
}

function validateInitiative(file, props, content, allIds) {
  const errors = [];

  for (const key of INITIATIVE_REQUIRED) {
    if (props[key] === undefined || props[key] === null || props[key] === "") {
      errors.push(`missing required key: ${key}`);
    }
  }

  if (props.work_item_type !== "initiative") {
    errors.push(`work_item_type must be "initiative"`);
  }
  if (props.state && !INITIATIVE_STATE.includes(props.state)) {
    errors.push(
      `invalid state: ${props.state} (expected: ${INITIATIVE_STATE.join("|")})`
    );
  }
  if (props.priority !== undefined && !PRIORITY.includes(props.priority)) {
    errors.push(
      `invalid priority: ${props.priority} (expected: ${PRIORITY.join("|")})`
    );
  }
  if (props.estimate !== undefined && !ESTIMATE.includes(props.estimate)) {
    errors.push(
      `invalid estimate: ${props.estimate} (expected: ${ESTIMATE.join("|")})`
    );
  }
  if (props.work_item_id && !String(props.work_item_id).startsWith("ini.")) {
    errors.push(`work_item_id must start with "ini."`);
  }

  const created = String(props.created || "");
  const updated = String(props.updated || "");
  if (props.created && !DATE_REGEX.test(created)) {
    errors.push(`invalid created date: ${props.created}`);
  }
  if (props.updated && !DATE_REGEX.test(updated)) {
    errors.push(`invalid updated date: ${props.updated}`);
  }

  if (props.work_item_id) {
    const id = String(props.work_item_id);
    if (allIds.has(id)) {
      errors.push(`duplicate work_item_id: ${id}`);
    } else {
      allIds.set(id, file);
    }
  }

  errors.push(...checkFieldSetSeparation(props, true));
  errors.push(...checkRequiredHeadings(content, INITIATIVE_REQUIRED_HEADINGS));

  return errors;
}

function validateIssue(file, props, content, allIds, initiativeIds) {
  const errors = [];

  for (const key of ISSUE_REQUIRED) {
    if (props[key] === undefined || props[key] === null || props[key] === "") {
      errors.push(`missing required key: ${key}`);
    }
  }

  if (props.work_item_type !== "issue") {
    errors.push(`work_item_type must be "issue"`);
  }
  if (props.state && !ISSUE_STATE.includes(props.state)) {
    errors.push(
      `invalid state: ${props.state} (expected: ${ISSUE_STATE.join("|")})`
    );
  }
  if (props.priority !== undefined && !PRIORITY.includes(props.priority)) {
    errors.push(
      `invalid priority: ${props.priority} (expected: ${PRIORITY.join("|")})`
    );
  }
  if (props.estimate !== undefined && !ESTIMATE.includes(props.estimate)) {
    errors.push(
      `invalid estimate: ${props.estimate} (expected: ${ESTIMATE.join("|")})`
    );
  }
  if (props.work_item_id && !String(props.work_item_id).startsWith("wi.")) {
    errors.push(`work_item_id must start with "wi."`);
  }
  if (props.initiative && !String(props.initiative).startsWith("ini.")) {
    errors.push(`initiative must reference "ini.*"`);
  }
  if (props.initiative && !initiativeIds.has(String(props.initiative))) {
    errors.push(`initiative "${props.initiative}" not found`);
  }

  const created = String(props.created || "");
  const updated = String(props.updated || "");
  if (props.created && !DATE_REGEX.test(created)) {
    errors.push(`invalid created date: ${props.created}`);
  }
  if (props.updated && !DATE_REGEX.test(updated)) {
    errors.push(`invalid updated date: ${props.updated}`);
  }

  if (props.work_item_id) {
    const id = String(props.work_item_id);
    if (allIds.has(id)) {
      errors.push(`duplicate work_item_id: ${id}`);
    } else {
      allIds.set(id, file);
    }
  }

  errors.push(...checkFieldSetSeparation(props, true));
  errors.push(...checkRequiredHeadings(content, ISSUE_REQUIRED_HEADINGS));

  return errors;
}

// === MAIN ===
async function main() {
  let hasErrors = false;
  const allIds = new Map();
  const initiativeIds = new Set();

  const initiativeFiles = await fg(["work/initiatives/**/*.md"]);
  for (const f of initiativeFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractFrontmatter(content);
      if (props.work_item_id) initiativeIds.add(String(props.work_item_id));
    } catch {
      // Ignore parse errors in phase 1
    }
  }

  const docFiles = await fg([
    "docs/spec/**/*.md",
    "docs/decisions/adr/**/*.md",
    "docs/guides/**/*.md",
    "docs/research/**/*.md",
    "docs/postmortems/**/*.md",
    "!docs/research/archive/**/*.md",
  ]);
  for (const f of docFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractFrontmatter(content);
      const errors = [
        ...checkForbidden(content),
        ...validateDoc(f, props, content, allIds),
      ];
      if (errors.length) {
        hasErrors = true;
        for (const e of errors) console.error(`${f}: ${e}`);
      }
    } catch (e) {
      hasErrors = true;
      console.error(`${f}: ${e.message}`);
    }
  }

  for (const f of initiativeFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractFrontmatter(content);
      const errors = [
        ...checkForbidden(content),
        ...validateInitiative(f, props, content, allIds),
      ];
      if (errors.length) {
        hasErrors = true;
        for (const e of errors) console.error(`${f}: ${e}`);
      }
    } catch (e) {
      hasErrors = true;
      console.error(`${f}: ${e.message}`);
    }
  }

  const issueFiles = await fg(["work/issues/**/*.md"]);
  for (const f of issueFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractFrontmatter(content);
      const errors = [
        ...checkForbidden(content),
        ...validateIssue(f, props, content, allIds, initiativeIds),
      ];
      if (errors.length) {
        hasErrors = true;
        for (const e of errors) console.error(`${f}: ${e}`);
      }
    } catch (e) {
      hasErrors = true;
      console.error(`${f}: ${e.message}`);
    }
  }

  if (hasErrors) process.exit(1);

  const total = docFiles.length + initiativeFiles.length + issueFiles.length;
  console.log(
    `docs/work metadata OK (${total} files, ${allIds.size} unique ids)`
  );
}

main().catch((e) => {
  console.error("validate-docs-metadata: internal error", e);
  process.exit(2);
});
