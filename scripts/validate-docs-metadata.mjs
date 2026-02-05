#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@scripts/validate-docs-metadata`
 * Purpose: Validates Logseq-style properties in /docs and /work directories.
 * Scope: Enforces field requirements, enums, CSV format, field set separation; does NOT validate content.
 * Invariants: /docs uses id/type/status/trust; /work uses work_item_id/work_item_type/state; no YAML frontmatter; no wikilinks.
 * Side-effects: IO
 * Notes: Follows validate-agents-md.mjs pattern; exits with error code if validation fails.
 * Links: docs/DOCS_ORGANIZATION_PLAN.md
 * @public
 */

import { readFileSync } from "node:fs";
import fg from "fast-glob";

// === DOCS ENUMS (Simplified) ===
const DOC_TYPES = ["spec", "adr", "guide"];
const DOC_STATUS = ["active", "deprecated", "superseded", "draft"];
const DOC_TRUST = ["canonical", "reviewed", "draft", "external"];

// === WORK ENUMS (Plane-aligned vocabulary, Simplified) ===
const _WORK_ITEM_TYPES = ["project", "issue"]; // Reserved for future type validation
const PROJECT_STATE = ["Active", "Paused", "Done", "Dropped"];
const ISSUE_STATE = ["Backlog", "Todo", "In Progress", "Done", "Cancelled"];
const PRIORITY = ["Urgent", "High", "Medium", "Low", "None"];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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
const PROJECT_REQUIRED = [
  "work_item_id",
  "work_item_type",
  "title",
  "state",
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
  "summary",
  "outcome",
  "assignees",
  "project",
  "created",
  "updated",
];
// === FORBIDDEN FIELDS (field set separation) ===
const DOCS_FORBIDDEN = ["work_item_id", "work_item_type", "state", "outcome"];
const WORK_FORBIDDEN = ["id", "type", "status", "trust", "read_when"];

// === PARSER (Logseq-style key:: value) ===
function extractProperties(content) {
  const props = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/^([a-z_]+)::\s*(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();
      if (props[key]) {
        throw new Error(`duplicate property key: ${key}`);
      }
      props[key] = value;
    } else if (
      line.startsWith("#") ||
      (line.trim() && !line.match(/^[a-z_]+::/))
    ) {
      break;
    }
  }
  return props;
}

// === CSV VALIDATOR ===
function validateCSV(field, value, _file) {
  if (!value) return;
  if (/,,/.test(value)) throw new Error(`${field} has empty CSV segment`);
  if (/^,|,$/.test(value))
    throw new Error(`${field} has leading/trailing comma`);
  const segments = value.split(",").map((s) => s.trim());
  if (segments.some((s) => !s))
    throw new Error(`${field} has empty CSV segment after trim`);
}

// === FORBIDDEN PATTERNS ===
function checkForbidden(_file, content) {
  const errors = [];
  if (/^---\s*\n/.test(content)) {
    errors.push("YAML frontmatter forbidden (use key:: value properties)");
  }
  if (/\[\[.+?\]\]/.test(content)) {
    errors.push("wikilinks forbidden (use markdown links)");
  }
  return errors;
}

// === FIELD SET SEPARATION ===
function checkFieldSetSeparation(_file, props, isWork) {
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

// === VALIDATORS ===
function validateDoc(file, props, allIds) {
  const errors = [];

  for (const key of DOC_REQUIRED) {
    if (!props[key]) errors.push(`missing required key: ${key}`);
  }

  // verified:: required unless status=draft
  if (props.status !== "draft" && !props.verified) {
    errors.push(`verified:: required when status != draft`);
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

  if (props.created && !DATE_REGEX.test(props.created)) {
    errors.push(`invalid created date: ${props.created}`);
  }
  if (props.verified && !DATE_REGEX.test(props.verified)) {
    errors.push(`invalid verified date: ${props.verified}`);
  }

  try {
    validateCSV("owner", props.owner, file);
    validateCSV("tags", props.tags, file);
  } catch (e) {
    errors.push(e.message);
  }

  // Type must match directory
  const dirType = file.match(/docs\/([^/]+)\//)?.[1];
  if (dirType && props.type && dirType !== props.type) {
    errors.push(`type "${props.type}" does not match directory "${dirType}"`);
  }

  // Unique ID check
  if (props.id) {
    if (allIds.has(props.id)) {
      errors.push(
        `duplicate id: ${props.id} (also in ${allIds.get(props.id)})`
      );
    } else {
      allIds.set(props.id, file);
    }
  }

  // Field set separation
  errors.push(...checkFieldSetSeparation(file, props, false));

  return errors;
}

function validateProject(file, props, allIds) {
  const errors = [];

  for (const key of PROJECT_REQUIRED) {
    if (!props[key]) errors.push(`missing required key: ${key}`);
  }

  if (props.work_item_type !== "project") {
    errors.push(`work_item_type must be "project"`);
  }
  if (props.state && !PROJECT_STATE.includes(props.state)) {
    errors.push(
      `invalid state: ${props.state} (expected: ${PROJECT_STATE.join("|")})`
    );
  }
  if (props.work_item_id && !props.work_item_id.startsWith("wi.")) {
    errors.push(`work_item_id must start with "wi."`);
  }

  if (props.created && !DATE_REGEX.test(props.created)) {
    errors.push(`invalid created date: ${props.created}`);
  }
  if (props.updated && !DATE_REGEX.test(props.updated)) {
    errors.push(`invalid updated date: ${props.updated}`);
  }

  try {
    validateCSV("assignees", props.assignees, file);
  } catch (e) {
    errors.push(e.message);
  }

  if (props.work_item_id) {
    if (allIds.has(props.work_item_id)) {
      errors.push(`duplicate work_item_id: ${props.work_item_id}`);
    } else {
      allIds.set(props.work_item_id, file);
    }
  }

  errors.push(...checkFieldSetSeparation(file, props, true));

  return errors;
}

function validateIssue(file, props, allIds, projectIds) {
  const errors = [];

  for (const key of ISSUE_REQUIRED) {
    if (!props[key]) errors.push(`missing required key: ${key}`);
  }

  if (props.work_item_type !== "issue") {
    errors.push(`work_item_type must be "issue"`);
  }
  if (props.state && !ISSUE_STATE.includes(props.state)) {
    errors.push(
      `invalid state: ${props.state} (expected: ${ISSUE_STATE.join("|")})`
    );
  }
  if (props.priority && !PRIORITY.includes(props.priority)) {
    errors.push(
      `invalid priority: ${props.priority} (expected: ${PRIORITY.join("|")})`
    );
  }
  if (props.work_item_id && !props.work_item_id.startsWith("wi.")) {
    errors.push(`work_item_id must start with "wi."`);
  }
  if (props.project && !props.project.startsWith("wi.")) {
    errors.push(`project must reference "wi.*"`);
  }

  // Verify project exists
  if (props.project && !projectIds.has(props.project)) {
    errors.push(`project "${props.project}" not found`);
  }

  if (props.created && !DATE_REGEX.test(props.created)) {
    errors.push(`invalid created date: ${props.created}`);
  }
  if (props.updated && !DATE_REGEX.test(props.updated)) {
    errors.push(`invalid updated date: ${props.updated}`);
  }

  try {
    validateCSV("assignees", props.assignees, file);
    validateCSV("labels", props.labels, file);
    validateCSV("external_refs", props.external_refs, file);
  } catch (e) {
    errors.push(e.message);
  }

  if (props.work_item_id) {
    if (allIds.has(props.work_item_id)) {
      errors.push(`duplicate work_item_id: ${props.work_item_id}`);
    } else {
      allIds.set(props.work_item_id, file);
    }
  }

  errors.push(...checkFieldSetSeparation(file, props, true));

  return errors;
}

// === MAIN ===
async function main() {
  let hasErrors = false;
  const allIds = new Map();
  const projectIds = new Set();

  // === Phase 1: Collect project IDs first ===
  const projectFiles = await fg(["work/projects/**/*.md"]);
  for (const f of projectFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractProperties(content);
      if (props.work_item_id) projectIds.add(props.work_item_id);
    } catch {
      // Ignore parse errors in phase 1
    }
  }

  // === Phase 2: Validate docs ===
  const docFiles = await fg([
    "docs/spec/**/*.md",
    "docs/decisions/adr/**/*.md",
    "docs/guides/**/*.md",
  ]);

  for (const f of docFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractProperties(content);
      const errors = [
        ...checkForbidden(f, content),
        ...validateDoc(f, props, allIds),
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

  // === Phase 3: Validate projects ===
  for (const f of projectFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractProperties(content);
      const errors = [
        ...checkForbidden(f, content),
        ...validateProject(f, props, allIds),
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

  // === Phase 4: Validate issues ===
  const issueFiles = await fg(["work/issues/**/*.md"]);
  for (const f of issueFiles) {
    try {
      const content = readFileSync(f, "utf8");
      const props = extractProperties(content);
      const errors = [
        ...checkForbidden(f, content),
        ...validateIssue(f, props, allIds, projectIds),
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

  const total = docFiles.length + projectFiles.length + issueFiles.length;
  console.log(
    `docs/work metadata OK (${total} files, ${allIds.size} unique ids)`
  );
}

main().catch((e) => {
  console.error("validate-docs-metadata: internal error", e);
  process.exit(2);
});
