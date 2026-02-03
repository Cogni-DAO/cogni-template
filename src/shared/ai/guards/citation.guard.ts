// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/ai/guards/citation.guard`
 * Purpose: Citation enforcement for Brain-mode AI responses.
 * Scope: Checks server-collected sources against response content. Does NOT scan LLM text for tokens.
 * Invariants:
 *   - NO_CLAIMS_WITHOUT_CITES: If response mentions repo specifics and no repo tools fired, reject
 *   - Fail-closed: Missing sources → one retrieval retry → refuse
 *   - Brain-only: Non-brain routes pass requireCitations=false (guard is inert)
 * Side-effects: none (pure validation)
 * Links: COGNI_BRAIN_SPEC.md
 * @public
 */

/**
 * Detect whether response mentions repo-specific content.
 * Narrow by design: file paths and fenced code blocks only.
 */
const REPO_MENTION_PATTERNS = [
  // File paths like src/foo/bar.ts, packages/ai-tools/src/index.ts
  /\b(?:src|lib|packages|services|tests?)\/[a-zA-Z0-9_\-./]+\.[a-z]{1,4}\b/i,
  // Fenced code blocks (suggesting code is being shown)
  /```[a-z]*\n/,
];

/**
 * Parse a citation token into its components.
 */
export interface ParsedCitation {
  repoId: string;
  path: string;
  lineStart: number;
  lineEnd: number;
  sha: string;
}

/**
 * Parse a citation token.
 * Returns null if the citation is malformed.
 *
 * Format: `repo:<repoId>:<path>#L<start>-L<end>@<sha7>`
 */
export function parseCitation(citation: string): ParsedCitation | null {
  const match = citation.match(
    /^repo:([a-z0-9_-]+):([^#\s]+)#L(\d+)-L(\d+)@([0-9a-f]{7})$/
  );
  if (!match) {
    return null;
  }

  const repoId = match[1];
  const path = match[2];
  const startStr = match[3];
  const endStr = match[4];
  const sha = match[5];

  if (!repoId || !path || !startStr || !endStr || !sha) {
    return null;
  }

  const lineStart = parseInt(startStr, 10);
  const lineEnd = parseInt(endStr, 10);

  if (lineStart < 1 || lineEnd < lineStart) {
    return null;
  }

  return { repoId, path, lineStart, lineEnd, sha };
}

/**
 * Validate server-collected sources against allowed repos.
 * Returns only sources that parse correctly and belong to allowed repos.
 */
export function validateSources(
  sources: readonly string[],
  allowedRepoIds: readonly string[] = ["main"]
): string[] {
  const valid: string[] = [];
  for (const source of sources) {
    const parsed = parseCitation(source);
    if (parsed && allowedRepoIds.includes(parsed.repoId)) {
      valid.push(source);
    }
  }
  return valid;
}

/**
 * Check whether response mentions repo-specific content (file paths, code blocks).
 */
function mentionsRepoSpecifics(response: string): boolean {
  return REPO_MENTION_PATTERNS.some((p) => p.test(response));
}

/**
 * Standard rejection message for uncited repo claims.
 * TODO: be better about this message
 */
export const INSUFFICIENT_CITATION_MESSAGE =
  "Insufficient cited evidence. I need to search the repository to provide " +
  "accurate information. Could you specify which file or module you're asking about?";

/**
 * Check if a Brain-mode response needs a retrieval retry.
 *
 * Returns true when the response mentions repo specifics (file paths, code blocks)
 * but no repo tool calls produced sources. The caller should force one repo.search
 * retry; if still empty after retry, respond with INSUFFICIENT_CITATION_MESSAGE.
 *
 * Non-brain routes pass sources=[] and the guard returns false (no repo mentions
 * expected in non-brain context, or set requireCitations=false to disable entirely).
 *
 * @param response - Assistant text to check
 * @param sources - Citation tokens collected server-side from repo tool outputs
 * @param options - Optional: allowedRepoIds, requireCitations override
 * @returns true if retry needed (mentions repo but no valid sources)
 */
export function needsCitationRetry(
  response: string,
  sources: readonly string[],
  options: { allowedRepoIds?: string[]; requireCitations?: boolean } = {}
): boolean {
  if (options.requireCitations === false) {
    return false;
  }
  if (!mentionsRepoSpecifics(response)) {
    return false;
  }
  const valid = validateSources(sources, options.allowedRepoIds);
  return valid.length === 0;
}
