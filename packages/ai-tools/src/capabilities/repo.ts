// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/capabilities/repo`
 * Purpose: Repository access capability interface for AI tool execution.
 * Scope: Defines RepoCapability for code search and file retrieval. Does NOT implement transport.
 * Invariants:
 *   - REPO_READ_ONLY: Capability provides read-only access
 *   - REPO_ROOT_ONLY: All paths relative to repo root, rejects .. and symlink escapes
 *   - SHA_STAMPED: All results include HEAD sha7
 *   - HARD_BOUNDS: search≤50 hits, snippet≤20 lines, open≤200 lines, max 256KB
 * Side-effects: none (interface only)
 * Links: COGNI_BRAIN_SPEC.md
 * @public
 */

/**
 * Single search hit from repository search.
 */
export interface RepoSearchHit {
  /** Repository identifier (e.g., "main") */
  repoId: string;
  /** File path relative to repo root */
  path: string;
  /** Starting line number (1-indexed) */
  lineStart: number;
  /** Ending line number (1-indexed) */
  lineEnd: number;
  /** Code snippet (max 20 lines) */
  snippet: string;
  /** HEAD sha (7 chars) */
  sha: string;
}

/**
 * Result from repository search.
 */
export interface RepoSearchResult {
  /** Search query used */
  query: string;
  /** Matching hits (max 50) */
  hits: RepoSearchHit[];
}

/**
 * Parameters for repository search.
 */
export interface RepoSearchParams {
  /** Search query (regex supported) */
  query: string;
  /** Optional glob pattern to filter files */
  glob?: string;
  /** Maximum results to return (1-50, default 10) */
  limit?: number;
}

/**
 * Result from opening a file.
 */
export interface RepoOpenResult {
  /** Repository identifier (e.g., "main") */
  repoId: string;
  /** File path relative to repo root */
  path: string;
  /** HEAD sha (7 chars) */
  sha: string;
  /** Starting line number (1-indexed) */
  lineStart: number;
  /** Ending line number (1-indexed) */
  lineEnd: number;
  /** File content (max 200 lines) */
  content: string;
}

/**
 * Parameters for opening a file.
 */
export interface RepoOpenParams {
  /** File path relative to repo root */
  path: string;
  /** Starting line number (1-indexed, default 1) */
  lineStart?: number;
  /** Ending line number (1-indexed, default lineStart + 199) */
  lineEnd?: number;
}

/**
 * Repository access capability for AI tools.
 *
 * Per REPO_READ_ONLY: Provides read-only access to repository files.
 * Per REPO_ROOT_ONLY: All paths must be relative and within repo root.
 * Per SHA_STAMPED: All results include current HEAD sha.
 */
export interface RepoCapability {
  /**
   * Search repository for matching content.
   *
   * @param params - Search parameters (query, glob, limit)
   * @returns Search results with file paths, line numbers, and snippets
   * @throws If search fails or repository is unavailable
   */
  search(params: RepoSearchParams): Promise<RepoSearchResult>;

  /**
   * Open a file and retrieve its content.
   *
   * @param params - Open parameters (path, lineStart, lineEnd)
   * @returns File content with path, sha, and line range
   * @throws If file not found, path invalid, or file exceeds size limit
   */
  open(params: RepoOpenParams): Promise<RepoOpenResult>;

  /**
   * Get current HEAD sha (7 chars).
   *
   * @returns 7-character SHA prefix of current HEAD
   * @throws If repository is unavailable
   */
  getSha(): Promise<string>;
}

/**
 * Generate citation token from search hit or open result.
 *
 * Format: `repo:<repoId>:<path>#L<start>-L<end>@<sha7>`
 *
 * @example
 * makeRepoCitation({ repoId: "main", path: "src/foo.ts", lineStart: 10, lineEnd: 20, sha: "abc1234" })
 * // => "repo:main:src/foo.ts#L10-L20@abc1234"
 */
export function makeRepoCitation(
  hit: Pick<RepoSearchHit, "repoId" | "path" | "lineStart" | "lineEnd" | "sha">
): string {
  return `repo:${hit.repoId}:${hit.path}#L${hit.lineStart}-L${hit.lineEnd}@${hit.sha.slice(0, 7)}`;
}

/**
 * Regex pattern for validating repo citations.
 *
 * Matches: `repo:<repoId>:<relpath>#L<start>-L<end>@<sha7>`
 * - repoId: lowercase alphanumeric with underscores/hyphens
 * - relpath: any non-whitespace, non-# characters
 * - start/end: positive integers
 * - sha7: 7 hex characters
 */
export const REPO_CITATION_REGEX =
  /\brepo:[a-z0-9_-]+:[^#\s]+#L\d+-L\d+@[0-9a-f]{7}\b/g;
