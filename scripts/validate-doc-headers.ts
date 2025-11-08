// script/validate-doc-headers.ts

import fs from "node:fs";
import path from "node:path";

import fg from "fast-glob";

interface Violation {
  file: string;
  code: string;
  msg: string;
  line: number;
  col: number;
}

const INCLUDE = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["src/**/*.{ts,tsx}"];
const EXCLUDE = [
  "**/*.d.ts",
  "**/generated/**",
  "**/fixtures/**",
  "**/icons/**",
  "**/*.svg.tsx",
];
const MAX_HEADER_LINES = 40;
const ALLOWED_SIDE_EFFECTS = [
  "none",
  "IO",
  "time",
  "randomness",
  "process.env",
  "global",
];

// Anchored label regexes inside a TSDoc block line prefix "*"
const RX = {
  module: /^\s*\*\s*Module:\s*(.+)\s*$/m,
  purpose: /^\s*\*\s*Purpose:\s*(.+)\s*$/m,
  scope: /^\s*\*\s*Scope:\s*(.+)\s*$/m,
  invariants: /^\s*\*\s*Invariants:\s*(.+)\s*$/m,
  sideEffects: /^\s*\*\s*Side-effects:\s*(.+)\s*$/m,
  notes: /^\s*\*\s*Notes:\s*(.+)\s*$/m,
  links: /^\s*\*\s*Links:\s*(.+)\s*$/m,
  visibility: /^\s*\*\s*@(public|internal|beta)\s*$/m,
};

const SPDX_LINE = /^\s*\/\/\s*SPDX-/;
const JS_DOC_OPEN = "/**";
const JS_DOC_CLOSE = "*/";

function err(
  file: string,
  code: string,
  msg: string,
  line = 1,
  col = 1
): Violation {
  return { file, code, msg, line, col };
}

function findHeader(
  source: string
): { header: string; startLine: number; endLine: number } | null {
  const lines = source.split(/\r?\n/);
  let i = 0;
  // allow up to 2 SPDX lines
  let spdxCount = 0;
  while (i < lines.length && lines[i] && SPDX_LINE.test(lines[i])) {
    spdxCount++;
    i++;
    if (spdxCount > 2) break;
  }
  // header must start within first 5 non-empty lines after SPDX
  const searchWindowEnd = Math.min(i + 5, lines.length);
  for (let j = i; j < searchWindowEnd; j++) {
    const l = lines[j]?.trim();
    if (l?.startsWith(JS_DOC_OPEN)) {
      // find end
      for (let k = j; k < Math.min(j + MAX_HEADER_LINES, lines.length); k++) {
        if (lines[k]?.includes(JS_DOC_CLOSE)) {
          const startIdx = j;
          const endIdx = k;
          const header = lines.slice(startIdx, endIdx + 1).join("\n");
          return { header, startLine: startIdx + 1, endLine: endIdx + 1 };
        }
      }
      // too long or no close
      return null;
    }
    if (l && l.length > 0 && !l.startsWith("//")) {
      // first non-empty non-SPDX non-comment line is code => no header first
      break;
    }
  }
  return null;
}

function validateHeader(file: string, header: string): Violation[] {
  const v: Violation[] = [];
  const headerLineCount = header.split(/\r?\n/).length;
  if (headerLineCount > MAX_HEADER_LINES) {
    v.push(
      err(
        file,
        "DH008",
        `header-too-long: ${headerLineCount} > ${MAX_HEADER_LINES}`
      )
    );
  }

  const requireLabel = (name: keyof typeof RX): string => {
    const m = RX[name].exec(header);
    if (!m) v.push(err(file, "DH003", `missing-label:${name}`));
    else if (!m[1]?.trim()) v.push(err(file, "DH004", `empty-label:${name}`));
    return m?.[1]?.trim() ?? "";
  };

  const purpose = requireLabel("purpose");
  const scope = requireLabel("scope");
  const invariants = requireLabel("invariants");
  const sideEffects = requireLabel("sideEffects");
  const links = requireLabel("links");

  // Optional labels
  const notes = RX.notes.exec(header)?.[1]?.trim() ?? "";
  const visibility = RX.visibility.exec(header)?.[1] ?? "";

  // Purpose: ≤ ~400 chars and at least one period
  if (purpose) {
    if (purpose.length > 400) v.push(err(file, "DH004", "purpose-too-long"));
    if (!/[.!?]/.test(purpose))
      v.push(err(file, "DH004", "purpose-needs-sentence"));
  }

  // Scope: must include a negative clause indicator
  if (scope && !/\b(not|doesn'?t|does not)\b/i.test(scope)) {
    v.push(err(file, "DH004", "scope-must-include-negative-clause"));
  }

  // Invariants: allow up to 3 bullets separated by ";" or "•" or list-like text
  if (invariants) {
    const items = invariants
      .split(/(?:^|\s)[-*•;]\s+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 3)
      v.push(err(file, "DH006", `invariants-too-many:${items.length}`));
    if (items.some((x) => x.length > 140))
      v.push(err(file, "DH006", "invariants-item-too-long"));
  }

  // Side-effects: comma-separated allowed tokens (with optional parenthetical descriptions)
  if (sideEffects) {
    const tokens = sideEffects
      .split(",")
      .map((t) => t.trim().split(/\s*\(/)[0])
      .filter((t): t is string => Boolean(t));
    const invalid = tokens.filter((t) => !ALLOWED_SIDE_EFFECTS.includes(t));
    if (invalid.length > 0)
      v.push(err(file, "DH005", `side-effects-invalid:${invalid.join("|")}`));
    if (new Set(tokens).size !== tokens.length)
      v.push(err(file, "DH005", "side-effects-duplicate"));
  }

  // Notes: up to 3 bullets
  if (notes) {
    const items = notes
      .split(/(?:^|\s)[-*•;]\s+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length > 3)
      v.push(err(file, "DH007", `notes-too-many:${items.length}`));
    if (items.some((x) => x.length > 140))
      v.push(err(file, "DH007", "notes-item-too-long"));
  }

  // Links: at least one token
  if (links) {
    const items = links
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) v.push(err(file, "DH004", "links-empty"));
  }

  // Visibility: if present must be single and valid
  const visTags = Array.from(
    header.matchAll(/^\s*\*\s*@(public|internal|beta)\s*$/gm)
  ).map((m) => m[1]);
  if (visTags.length > 1) v.push(err(file, "DH009", "visibility-multiple"));
  if (
    visTags.length === 1 &&
    !["public", "internal", "beta"].includes(visibility)
  )
    v.push(err(file, "DH009", "visibility-invalid"));

  return v;
}

async function main(): Promise<void> {
  const files = await fg(INCLUDE, { ignore: EXCLUDE, absolute: true });
  const violations: Violation[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const header = findHeader(src);
    if (!header) {
      violations.push(
        err(path.relative(process.cwd(), f), "DH001", "missing-header")
      );
      continue;
    }
    const fileRel = path.relative(process.cwd(), f);
    const vs = validateHeader(fileRel, header.header);
    violations.push(...vs);
  }
  if (violations.length) {
    for (const v of violations) {
      console.error(`${v.file}:${v.line}:${v.col}  ${v.code}  ${v.msg}`);
    }
    process.exit(1);
  }
  console.log(`doc-header-check: OK (${files.length} files)`);
}

main().catch((e) => {
  console.error("doc-header-check: internal-error", e);
  process.exit(2);
});
